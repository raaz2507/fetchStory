const crypto = require("crypto");

const processTranslation = require("../services/processTranslation");

const progressStore = require("../jobs/progressStore");

exports.translateJson = async (req, res) => {
	try {
		const jobId = crypto.randomUUID();

		progressStore[jobId] = {
			current: 0,

			total: 0,

			done: false,
		};

		processTranslation(req.body && req.body.storyData, jobId).catch((error) => {
			console.log(error);
			progressStore[jobId].error = error.message;
			progressStore[jobId].done = true;
		});

		res.json({
			success: true,

			jobId,
		});
	} catch (error) {
		console.log(error);

		res.status(500).json({
			success: false,

			error: error.message,
		});
	}
};
