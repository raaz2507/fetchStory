const express = require("express");

const progressStore = require("./progressStore");

const router = express.Router();

router.get("/progress/:jobId", (req, res) => {
	const { jobId } = req.params;

	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	if (typeof res.flushHeaders === "function") res.flushHeaders();

	const writeProgress = () => {
		const progress = progressStore[jobId];
		const payload = progress || {
			current: 0,
			total: 0,
			done: false,
			message: "Waiting for translation job",
		};
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
		return Boolean(progress && progress.done);
	};

	writeProgress();
	const interval = setInterval(() => {
		if (!writeProgress()) return;
		clearInterval(interval);
		setTimeout(() => res.end(), 1000);
		setTimeout(() => delete progressStore[jobId], 10 * 60 * 1000);
	}, 500);

	req.on("close", () => clearInterval(interval));
});

module.exports = router;
