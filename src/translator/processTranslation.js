const fs = require("fs");
const path = require("path");

const TransliterationEngine = require("../../translator/engine/transliterate");
const progressStore = require("./progressStore");

async function processTranslation(storyData, jobId, expectedChecksum) {
	if (!storyData || typeof storyData !== "object") {
		throw new Error("Story JSON data missing");
	}

	const story = normalizeStory(storyData);
	const engPosts = story.posts.eng;
	const postKeys = Object.keys(engPosts).sort((a, b) => Number(a) - Number(b));
	const actualChecksum = getStoryChecksum(engPosts, postKeys);
	const progress = progressStore[jobId] || (progressStore[jobId] = {});

	validateChecksum(expectedChecksum, actualChecksum);
	Object.assign(progress, {
		current: 0,
		total: postKeys.length,
		done: false,
		checksum: actualChecksum,
		currentPage: null,
		totalWords: actualChecksum.words,
		translatedWords: 0,
		notFoundWords: 0,
		notFoundTotal: 0,
		conversionPercent: 0,
		message: "Loading dictionary",
	});

	const dictionaryStatus = await TransliterationEngine.initializeDictionary();
	progress.dictionarySource = dictionaryStatus.source;
	progress.message = `Translation started (${dictionaryStatus.source} dictionary)`;

	const engine = new TransliterationEngine();
	let completedPages = 0;
	let translatedWordsFromExistingPages = 0;

	for (const page of postKeys) {
		if (progress.cancelRequested) {
			updateProgressStats(
				progress,
				engine,
				actualChecksum.words,
				translatedWordsFromExistingPages,
			);
			Object.assign(progress, {
				cancelled: true,
				done: true,
				message: "Translation stopped",
				completedAt: Date.now(),
			});
			return null;
		}

		progress.currentPage = page;
		progress.message = `Translating post ${page}`;
		const pageWordCount = TransliterationEngine.countWordsFromHtml(engPosts[page] || "");

		if (story.posts.hin[page]) {
			completedPages++;
			translatedWordsFromExistingPages += pageWordCount;
			progress.current = completedPages;
			progress.message = `Post ${page} already translated`;
		} else {
			story.posts.hin[page] = engine.convertHTML(engPosts[page]);
			completedPages++;
			progress.current = completedPages;
			progress.message = `Post ${page} translated`;
		}

		updateProgressStats(
			progress,
			engine,
			actualChecksum.words,
			translatedWordsFromExistingPages,
		);
		await new Promise((resolve) => setImmediate(resolve));
	}

	const outputsFolder = path.join(__dirname, "..", "..", "translator", "outputs");
	await fs.promises.mkdir(outputsFolder, { recursive: true });

	const translatedFileName = `translated_story_${jobId}.json`;
	const notFoundFileName = `not_found_words_${jobId}.json`;
	const translatedPath = path.join(outputsFolder, translatedFileName);
	const notFoundPath = path.join(outputsFolder, notFoundFileName);
	const finalStats = updateProgressStats(
		progress,
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

	Object.assign(progress, {
		translatedFile: result.translatedUrl,
		notFoundFile: result.notFoundUrl,
		totalWords: finalStats.totalWords,
		translatedWords: finalStats.translatedWords,
		notFoundWords: finalStats.notFoundCount,
		notFoundTotal: finalStats.notFoundTotal,
		conversionPercent: finalStats.conversionPercent,
		message: "Translation complete",
		done: true,
		completedAt: Date.now(),
	});
	setTimeout(() => delete progressStore[jobId], 10 * 60 * 1000);

	return result;
}

function normalizeStory(storyData) {
	const posts = storyData.posts || {};
	const story = {
		...storyData,
		posts: {
			...posts,
			eng: posts.eng || {},
			hin: {
				...(posts.hindi || {}),
				...(posts.hin || {}),
			},
		},
	};
	delete story.posts.hindi;
	return story;
}

function getStoryChecksum(engPosts, postKeys) {
	return {
		pages: postKeys.length,
		chars: postKeys.reduce(
			(sum, page) => sum + String(engPosts[page] || "").length,
			0,
		),
		words: postKeys.reduce(
			(sum, page) => sum + TransliterationEngine.countWordsFromHtml(engPosts[page] || ""),
			0,
		),
	};
}

function validateChecksum(expectedChecksum, actualChecksum) {
	if (!expectedChecksum) return;
	if (
		Number(expectedChecksum.pages) !== actualChecksum.pages
		|| Number(expectedChecksum.chars) !== actualChecksum.chars
	) {
		throw new Error(
			`Checksum mismatch: frontend ${Number(expectedChecksum.pages)} pages/${Number(expectedChecksum.chars)} chars, backend ${actualChecksum.pages} pages/${actualChecksum.chars} chars`,
		);
	}
}

function updateProgressStats(progress, engine, totalWords, existingTranslatedWords = 0) {
	const engineStats = engine.getStats();
	const translatedWords = existingTranslatedWords + engineStats.translatedWords;
	const stats = {
		...engineStats,
		totalWords,
		translatedWords,
		conversionPercent: totalWords
			? Math.round((translatedWords / totalWords) * 100)
			: 0,
	};
	progress.totalWords = stats.totalWords;
	progress.translatedWords = stats.translatedWords;
	progress.notFoundWords = stats.notFoundCount;
	progress.notFoundTotal = stats.notFoundTotal;
	progress.conversionPercent = stats.conversionPercent;
	return stats;
}

module.exports = processTranslation;
