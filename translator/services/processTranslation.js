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
	progressStore[jobId].message = "Loading dictionary";

	const dictionaryStatus = await TransliterationEngine.initializeDictionary();
	progressStore[jobId].dictionarySource = dictionaryStatus.source;
	progressStore[jobId].message = `Translation started (${dictionaryStatus.source} dictionary)`;

	console.log(
		`[translator:${jobId}] Translation started: ${postKeys.length} posts (${dictionaryStatus.source} dictionary)`
	);

	const allNotFoundWords = [];
	let completedPages = 0;

	for (const page of postKeys) {
		progressStore[jobId].currentPage = page;
		progressStore[jobId].message = `Translating post ${page}`;

		if (story.posts.hindi[page]) {
			completedPages++;
			progressStore[jobId].current = completedPages;
			progressStore[jobId].message = `Post ${page} already translated`;
			console.log(
				`[translator:${jobId}] ${completedPages}/${postKeys.length} post ${page} already translated`
			);
			await waitForProgressFlush();
			continue;
		}

		const engine = new TransliterationEngine();
		const hindiText = engine.convertHTML(engPosts[page]);

		story.posts.hindi[page] = hindiText;
		completedPages++;
		progressStore[jobId].current = completedPages;
		progressStore[jobId].message = `Post ${page} translated`;
		console.log(
			`[translator:${jobId}] ${completedPages}/${postKeys.length} post ${page} translated`
		);

		allNotFoundWords.push(...engine.notFoundWords);
		await waitForProgressFlush();
	}

	const outputsFolder = path.join(__dirname, "..", "outputs");
	await fs.promises.mkdir(outputsFolder, { recursive: true });

	const translatedFileName = `translated_story_${jobId}.json`;
	const notFoundFileName = `not_found_words_${jobId}.json`;
	const translatedPath = path.join(outputsFolder, translatedFileName);
	const notFoundPath = path.join(outputsFolder, notFoundFileName);

	await fs.promises.writeFile(translatedPath, JSON.stringify(story, null, 2));
	await fs.promises.writeFile(notFoundPath, JSON.stringify(countNotFoundWords(allNotFoundWords), null, 2));

	const result = {
		translatedPath,
		notFoundPath,
		translatedUrl: `/translator/outputs/${translatedFileName}`,
		notFoundUrl: `/translator/outputs/${notFoundFileName}`,
	};

	progressStore[jobId].translatedFile = result.translatedUrl;
	progressStore[jobId].notFoundFile = result.notFoundUrl;
	progressStore[jobId].message = "Translation complete";
	progressStore[jobId].done = true;

	console.log(`[translator:${jobId}] Translation complete`);

	return result;
}

function waitForProgressFlush() {
	return new Promise((resolve) => setImmediate(resolve));
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

function countNotFoundWords(words) {
	const notFoundObj = {};

	for (const word of words) {
		const normalized = String(word).toLowerCase();
		notFoundObj[normalized] = (notFoundObj[normalized] || 0) + 1;
	}

	return Object.fromEntries(
		Object.entries(notFoundObj).sort((a, b) => b[1] - a[1])
	);
}

function getStoryChecksum(engPosts, postKeys) {
	return {
		pages: postKeys.length,
		chars: postKeys.reduce((sum, page) => {
			return sum + String(engPosts[page] || "").length;
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
