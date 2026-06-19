const crypto = require("crypto");
const express = require("express");

const processTranslation = require("../services/translationService");
const progressStore = require("../translator/jobs/progressStore");

const router = express.Router();

router.post("/translate-json", (req, res) => {
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
			cancelRequested: false,
			createdAt: Date.now(),
			translatedFile,
			notFoundFile,
		};

		processTranslation(
			storyData,
			jobId,
			req.body && req.body.checksum,
		).catch((error) => {
			console.log(error);
			progressStore[jobId].error = error.message;
			progressStore[jobId].done = true;
			progressStore[jobId].completedAt = Date.now();
			setTimeout(() => {
				delete progressStore[jobId];
			}, 10 * 60 * 1000);
		});

		return res.json({
			success: true,
			jobId,
			translatedFile,
			notFoundFile,
		});
	} catch (error) {
		console.log(error);
		return res.status(500).json({
			success: false,
			error: error.message,
		});
	}
});

router.post("/translate-json/:jobId/cancel", (req, res) => {
	const jobId = req.params.jobId;
	const progress = progressStore[jobId];

	if (!progress) {
		return res.status(404).json({
			success: false,
			error: "Translation job not found",
		});
	}

	progress.cancelRequested = true;
	progress.message = "Stop requested. Finishing current post...";
	return res.json({ success: true, jobId });
});

router.get("/translate-json", (req, res) => {
	res.send("Use POST request");
});

module.exports = router;
