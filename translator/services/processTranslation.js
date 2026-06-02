const fs = require("fs");
const path = require("path");

const TransliterationEngine = require("../engine/transliterate");
const progressStore = require("../jobs/progressStore");

async function processTranslation(storyData, jobId) {
	if (!storyData || typeof storyData !== "object") {
		throw new Error("Story JSON data missing");
	}

	const story = normalizeStory(storyData);
	const engPosts = story.posts.eng;
	const postKeys = Object.keys(engPosts).sort((a, b) => Number(a) - Number(b));

	if (!progressStore[jobId]) {
		progressStore[jobId] = {};
	}

	progressStore[jobId].current = 0;
	progressStore[jobId].total = postKeys.length;
	progressStore[jobId].done = false;

	const allNotFoundWords = [];
	let completedPages = 0;

	for (const page of postKeys) {
		if (story.posts.hindi[page]) {
			completedPages++;
			progressStore[jobId].current = completedPages;
			continue;
		}

		const engine = new TransliterationEngine();
		const hindiText = engine.convertHTML(engPosts[page]);

		story.posts.hindi[page] = hindiText;
		completedPages++;
		progressStore[jobId].current = completedPages;

		allNotFoundWords.push(...engine.notFoundWords);
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
	progressStore[jobId].done = true;

	return result;
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

module.exports = processTranslation;
