const fs = require("fs");
const path = require("path");

const TransliterationEngine = require("../engine/transliterate");
const progressStore = require("../jobs/progressStore");

async function processTranslation(storyData, jobId, expectedChecksum) {
	if (!storyData || typeof storyData !== "object") {
		throw new Error("Story JSON data missing");
	}

	const story = normalizeStory(storyData);
	const engPosts = story.posts.eng;
	const postKeys = Object.keys(engPosts).sort((a, b) => Number(a) - Number(b));
	const actualChecksum = getStoryChecksum(engPosts, postKeys);

	if (!progressStore[jobId]) {
		progressStore[jobId] = {};
	}

	validateChecksum(expectedChecksum, actualChecksum);

	progressStore[jobId].current = 0;
	progressStore[jobId].total = postKeys.length;
	progressStore[jobId].done = false;
	progressStore[jobId].checksum = actualChecksum;
	progressStore[jobId].currentPage = null;
	progressStore[jobId].totalWords = actualChecksum.words;
	progressStore[jobId].translatedWords = 0;
	progressStore[jobId].notFoundWords = 0;
	progressStore[jobId].notFoundTotal = 0;
	progressStore[jobId].conversionPercent = 0;
	progressStore[jobId].message = "Loading dictionary";

	const dictionaryStatus = await TransliterationEngine.initializeDictionary();
	progressStore[jobId].dictionarySource = dictionaryStatus.source;
	progressStore[jobId].message = `Translation started (${dictionaryStatus.source} dictionary)`;

	console.log(
		`[translator:${jobId}] Translation started: ${postKeys.length} posts (${dictionaryStatus.source} dictionary)`
	);

	const engine = new TransliterationEngine();
	let completedPages = 0;
	let translatedWordsFromExistingPages = 0;

	for (const page of postKeys) {
		if (progressStore[jobId].cancelRequested) {
			const stoppedStats = updateProgressStats(
				progressStore[jobId],
				engine,
				actualChecksum.words,
				translatedWordsFromExistingPages,
			);
			progressStore[jobId].cancelled = true;
			progressStore[jobId].done = true;
			progressStore[jobId].message = "Translation stopped";
			progressStore[jobId].completedAt = Date.now();
			console.log(
				`[translator:${jobId}] Translation stopped at ${completedPages}/${postKeys.length} posts (${stoppedStats.conversionPercent}% words)`
			);
			return null;
		}

		progressStore[jobId].currentPage = page;
		progressStore[jobId].message = `Translating post ${page}`;
		const pageWordCount = TransliterationEngine.countWordsFromHtml(
			engPosts[page] || "",
		);

		if (story.posts.hindi[page]) {
			completedPages++;
			translatedWordsFromExistingPages += pageWordCount;
			progressStore[jobId].current = completedPages;
			progressStore[jobId].message = `Post ${page} already translated`;
			updateProgressStats(
				progressStore[jobId],
				engine,
				actualChecksum.words,
				translatedWordsFromExistingPages,
			);
			console.log(
				`[translator:${jobId}] ${completedPages}/${postKeys.length} post ${page} already translated`
			);
			await waitForProgressFlush();
			continue;
		}

		const hindiText = engine.convertHTML(engPosts[page]);

		story.posts.hindi[page] = hindiText;
		completedPages++;
		progressStore[jobId].current = completedPages;
		progressStore[jobId].message = `Post ${page} translated`;
		updateProgressStats(
			progressStore[jobId],
			engine,
			actualChecksum.words,
			translatedWordsFromExistingPages,
		);
		console.log(
			`[translator:${jobId}] ${completedPages}/${postKeys.length} post ${page} translated`
		);

		await waitForProgressFlush();
	}

	const outputsFolder = path.join(__dirname, "..", "outputs");
	await fs.promises.mkdir(outputsFolder, { recursive: true });

	const translatedFileName = `translated_story_${jobId}.json`;
	const notFoundFileName = `not_found_words_${jobId}.json`;
	const translatedPath = path.join(outputsFolder, translatedFileName);
	const notFoundPath = path.join(outputsFolder, notFoundFileName);

	const finalStats = updateProgressStats(
		progressStore[jobId],
		engine,
		actualChecksum.words,
		translatedWordsFromExistingPages,
	);

	await fs.promises.writeFile(translatedPath, JSON.stringify(story, null, 2));
	await fs.promises.writeFile(
		notFoundPath,
		JSON.stringify(finalStats.notFoundWords, null, 2),
	);

	const result = {
		translatedPath,
		notFoundPath,
		translatedUrl: `/translator/outputs/${translatedFileName}`,
		notFoundUrl: `/translator/outputs/${notFoundFileName}`,
	};

	progressStore[jobId].translatedFile = result.translatedUrl;
	progressStore[jobId].notFoundFile = result.notFoundUrl;
	progressStore[jobId].totalWords = finalStats.totalWords;
	progressStore[jobId].translatedWords = finalStats.translatedWords;
	progressStore[jobId].notFoundWords = finalStats.notFoundCount;
	progressStore[jobId].notFoundTotal = finalStats.notFoundTotal;
	progressStore[jobId].conversionPercent = finalStats.conversionPercent;
	progressStore[jobId].message = "Translation complete";
	progressStore[jobId].done = true;
	progressStore[jobId].completedAt = Date.now();
	setTimeout(() => {
		delete progressStore[jobId];
	}, 10 * 60 * 1000);

	console.log(`[translator:${jobId}] Translation complete`);

	return result;
}

function waitForProgressFlush() {
	return new Promise((resolve) => setImmediate(resolve));
}

function updateProgressStats(
	progress,
	engine,
	totalWords,
	translatedWordsFromExistingPages = 0,
) {
	const engineStats = engine.getStats();
	const translatedWords = translatedWordsFromExistingPages + engineStats.translatedWords;
	const conversionPercent = totalWords
		? Math.round((translatedWords / totalWords) * 100)
		: 0;
	const stats = {
		...engineStats,
		totalWords,
		translatedWords,
		conversionPercent,
	};

	progress.totalWords = stats.totalWords;
	progress.translatedWords = stats.translatedWords;
	progress.notFoundWords = stats.notFoundCount;
	progress.notFoundTotal = stats.notFoundTotal;
	progress.conversionPercent = stats.conversionPercent;

	return stats;
}

function normalizeStory(storyData) {
	const story = {
		...storyData,
		posts: {
			eng: storyData.posts && storyData.posts.eng ? storyData.posts.eng : {},
			hindi: storyData.posts && storyData.posts.hindi ? storyData.posts.hindi : {},
		},
	};

	return story;
}

function getStoryChecksum(engPosts, postKeys) {
	return {
		pages: postKeys.length,
		chars: postKeys.reduce((sum, page) => {
			return sum + String(engPosts[page] || "").length;
		}, 0),
		words: postKeys.reduce((sum, page) => {
			return sum + TransliterationEngine.countWordsFromHtml(engPosts[page] || "");
		}, 0),
	};
}

function validateChecksum(expectedChecksum, actualChecksum) {
	if (!expectedChecksum) return;

	const expectedPages = Number(expectedChecksum.pages);
	const expectedChars = Number(expectedChecksum.chars);
	if (
		expectedPages !== actualChecksum.pages ||
		expectedChars !== actualChecksum.chars
	) {
		throw new Error(
			`Checksum mismatch: frontend ${expectedPages} pages/${expectedChars} chars, backend ${actualChecksum.pages} pages/${actualChecksum.chars} chars`
		);
	}
}

module.exports = processTranslation;
