const processCanonicalTranslation = require("../src/translator/processTranslation");

async function processTranslation(storyData, jobId, expectedChecksum) {
	const posts = storyData && storyData.posts ? storyData.posts : {};
	const normalizedStory = {
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
	delete normalizedStory.posts.hindi;

	return processCanonicalTranslation(normalizedStory, jobId, expectedChecksum);
}

module.exports = processTranslation;
