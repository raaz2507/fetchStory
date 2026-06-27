const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { setImageFolder, serveLocalImage } = require("../controllers/readerController");
const {
	createPdfJob,
	getPdfJob,
	cancelPdfJob,
	getPdfJobFile,
} = require("../services/pdfJobService");

const router = express.Router();

router.post("/image-folder", setImageFolder);
router.post("/pdf-assets", async (req, res) => {
	try {
		const assetJobId = sanitizeAssetId(req.body?.assetJobId);
		const assets = Array.isArray(req.body?.assets) ? req.body.assets : [];
		if (!assetJobId || assets.length === 0) {
			return res.status(400).json({ error: "PDF assets missing." });
		}

		const assetDir = path.join(__dirname, "..", "downloads", "pdf-assets", assetJobId);
		await fs.promises.mkdir(assetDir, { recursive: true });

		const urls = {};
		for (const asset of assets) {
			const key = String(asset.key || "");
			const dataUrl = String(asset.dataUrl || "");
			const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
			if (!key || !match) continue;

			const fileName = `${crypto.createHash("sha256").update(key).digest("hex").slice(0, 12)}-${sanitizeAssetFileName(asset.fileName || `${key}.bin`)}`;
			const filePath = path.join(assetDir, fileName);
			await fs.promises.writeFile(filePath, Buffer.from(match[2], "base64"));
			urls[key] = `/downloads/pdf-assets/${assetJobId}/${fileName}`;
		}

		res.json({ ok: true, assetJobId, urls });
	} catch (err) {
		res.status(400).json({ error: err.message || "Could not save PDF assets." });
	}
});
router.post("/pdf-jobs", (req, res) => {
	try {
		const protocol = req.protocol || "http";
		const host = req.get("host") || "localhost:3000";
		const job = createPdfJob({
			storyData: req.body?.storyData,
			settings: req.body?.settings || {},
			baseUrl: `${protocol}://${host}`,
		});
		res.status(202).json(job);
	} catch (err) {
		res.status(400).json({ error: err.message || "Could not start PDF export." });
	}
});

router.get("/pdf-jobs/:jobId", (req, res) => {
	const job = getPdfJob(req.params.jobId);
	if (!job) return res.status(404).json({ error: "PDF job not found." });
	res.json(job);
});

router.delete("/pdf-jobs/:jobId", async (req, res) => {
	const job = await cancelPdfJob(req.params.jobId);
	if (!job) return res.status(404).json({ error: "PDF job not found." });
	res.json(job);
});

router.get("/pdf-jobs/:jobId/download", (req, res) => {
	const filePath = getPdfJobFile(req.params.jobId);
	if (!filePath) return res.status(404).json({ error: "PDF file is not ready." });
	res.download(filePath, "story.pdf");
});

function sanitizeAssetId(value) {
	const clean = String(value || "").trim();
	return /^[a-zA-Z0-9_-]{8,64}$/.test(clean) ? clean : "";
}

function sanitizeAssetFileName(value) {
	return String(value || "asset.bin")
		.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_")
		.replace(/\s+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 120) || "asset.bin";
}

module.exports = { router, serveLocalImage,};
