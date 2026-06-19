const fs = require("fs");

const processLegacyTranslation = require("../translator/services/processTranslation");

async function processTranslation(storyData, jobId, expectedChecksum) {
	const posts = storyData && storyData.posts ? storyData.posts : {};
	const normalizedStory = {
		...storyData,
		posts: {
			...posts,
			eng: posts.eng || {},
			hindi: {
				...(posts.hindi || {}),
				...(posts.hin || {}),
			},
		},
	};

	const result = await processLegacyTranslation(normalizedStory, jobId, expectedChecksum);
	if (!result || !result.translatedPath) return result;

	const translatedStory = JSON.parse(
		await fs.promises.readFile(result.translatedPath, "utf8"),
	);
	const translatedPosts = translatedStory.posts || {};
	translatedStory.posts = {
		...translatedPosts,
		eng: translatedPosts.eng || {},
		hin: {
			...(translatedPosts.hindi || {}),
			...(translatedPosts.hin || {}),
		},
	};
	delete translatedStory.posts.hindi;

	await fs.promises.writeFile(
		result.translatedPath,
		JSON.stringify(translatedStory, null, 2),
	);

	return result;
}

module.exports = processTranslation;
