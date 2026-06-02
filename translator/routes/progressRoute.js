const express = require("express");

const router = express.Router();

const progressStore = require("../jobs/progressStore");

router.get(
	"/progress/:jobId",

	(req, res) => {
		const jobId = req.params.jobId;

		res.setHeader("Content-Type", "text/event-stream");

		res.setHeader("Cache-Control", "no-cache");

		res.setHeader("Connection", "keep-alive");

		const interval = setInterval(() => {
			const progress = progressStore[jobId];

			if (!progress) {
				return;
			}

			// IMPORTANT
			res.write(`data: ${JSON.stringify(progress)}\n\n`);

			if (progress.done) {
				res.write(`data: ${JSON.stringify(progress)}\n\n`);

				clearInterval(interval);

				setTimeout(() => {
					res.end();
				}, 1000);
			}
		}, 500);
		req.on("close", () => {

			clearInterval(interval);
		});

	},
);


module.exports = router;
