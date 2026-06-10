const express = require("express");

const router = express.Router();

const progressStore = require("../jobs/progressStore");

router.get("/progress/:jobId", (req, res) => {
	const jobId = req.params.jobId;

	res.setHeader("Content-Type", "text/event-stream");

	res.setHeader("Cache-Control", "no-cache");

	res.setHeader("Connection", "keep-alive");
	if (typeof res.flushHeaders === "function") {
		res.flushHeaders();
	}

	const writeProgress = () => {
		const progress = progressStore[jobId];

		if (!progress) {
			res.write(
				`data: ${JSON.stringify({ current: 0, total: 0, done: false, message: "Waiting for translation job", })}\n\n`, );
			return false;
		}

		res.write(`data: ${JSON.stringify(progress)}\n\n`);
		return progress.done;
	};

	writeProgress();

	const interval = setInterval(() => {
		if (writeProgress()) {
			clearInterval(interval);

			setTimeout(() => { res.end(); }, 1000);

			setTimeout( () => { delete progressStore[jobId]; }, 10 * 60 * 1000,);
		}
	}, 500);
	req.on("close", () => { clearInterval(interval); });
});

module.exports = router;
