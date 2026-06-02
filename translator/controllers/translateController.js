const crypto = require("crypto");

const processTranslation = require("../services/processTranslation");

const progressStore = require("../jobs/progressStore");

exports.translateJson = async (req, res) => {
	try {
		const jobId = crypto.randomUUID();
		const storyData = req.body && req.body.storyData;
		const translatedFile = `/translator/outputs/translated_story_${jobId}.json`;
		const notFoundFile = `/translator/outputs/not_found_words_${jobId}.json`;

		if (!storyData || typeof storyData !== "object") {
			return res.status(400).json({
				success: false,

				error: "Story JSON data missing",
			});
		}

		progressStore[jobId] = {
			current: 0,

			total: 0,

			done: false,

			translatedFile,

			notFoundFile,
		};

		processTranslation(
			storyData,
			jobId,
			req.body && req.body.checksum
		).catch((error) => {
			console.log(error);
			progressStore[jobId].error = error.message;
			progressStore[jobId].done = true;
		});

		res.json({
			success: true,

			jobId,

			translatedFile,

			notFoundFile,
		});
	} catch (error) {
		console.log(error);

		res.status(500).json({
			success: false,

			error: error.message,
		});
	}
};
