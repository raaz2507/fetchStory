const fs = require("fs");
const path = require("path");

const jobs = new Map();

const PAGE_MARGINS = {
	compact: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
	normal: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
	wide: { top: "28mm", right: "26mm", bottom: "28mm", left: "26mm" },
};

function createPdfJob({ storyData, settings = {}, baseUrl = "http://localhost:3000" }) {
	if (!storyData || typeof storyData !== "object") {
		throw new Error("Story data is required.");
	}

	const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	const outputDir = path.join(__dirname, "..", "downloads", "pdf");
	const outputPath = path.join(outputDir, `${jobId}.pdf`);
	const job = {
		id: jobId,
		status: "queued",
		progress: 0,
		currentPage: 0,
		totalPages: getTotalPages(storyData, settings),
		message: "Queued",
		downloadUrl: null,
		error: null,
		outputPath,
		browser: null,
		cancelRequested: false,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	jobs.set(jobId, job);
	runPdfJob(job, storyData, settings, baseUrl, outputDir).catch((err) => {
		if (job.status === "cancelled") return;
		updateJob(job, {
			status: "failed",
			error: err.message || "PDF generation failed.",
			message: err.message || "PDF generation failed.",
			progress: Math.max(job.progress, 1),
		});
	});

	return serializeJob(job);
}

function getPdfJob(jobId) {
	const job = jobs.get(jobId);
	return job ? serializeJob(job) : null;
}

async function cancelPdfJob(jobId) {
	const job = jobs.get(jobId);
	if (!job) return null;
	job.cancelRequested = true;
	updateJob(job, { status: "cancelled", message: "PDF generation stopped." });
	if (job.browser) {
		await job.browser.close().catch(() => {});
		job.browser = null;
	}
	return serializeJob(job);
}

function getPdfJobFile(jobId) {
	const job = jobs.get(jobId);
	if (!job || job.status !== "completed" || !job.outputPath) return null;
	return job.outputPath;
}

async function runPdfJob(job, storyData, settings, baseUrl, outputDir) {
	updateJob(job, { status: "running", progress: 5, message: "Preparing story parts" });

	let puppeteer;
	try {
		puppeteer = require("puppeteer");
	} catch (_) {
		throw new Error("Puppeteer is not installed. Run npm install puppeteer to enable server PDF export.");
	}

	await fs.promises.mkdir(outputDir, { recursive: true });
	assertNotCancelled(job);

	updateJob(job, { progress: 18, currentPage: Math.min(1, job.totalPages), message: "Starting PDF engine" });
	job.browser = await puppeteer.launch({
		headless: "new",
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});

	try {
		assertNotCancelled(job);
		const page = await job.browser.newPage();
		await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
		updateJob(job, { progress: 35, message: "Laying out story" });

		await page.setContent(buildPrintableHtml(storyData, settings, baseUrl), {
			waitUntil: ["domcontentloaded", "networkidle0"],
			timeout: 120000,
		});
		assertNotCancelled(job);

		updateJob(job, { progress: 65, currentPage: job.totalPages, message: "Loading fonts and images" });
		await page.evaluate(async () => {
			if (document.fonts?.ready) await document.fonts.ready;
			const images = Array.from(document.images);
			await Promise.all(images.map((image) => {
				if (image.complete) return Promise.resolve();
				return new Promise((resolve) => {
					image.addEventListener("load", resolve, { once: true });
					image.addEventListener("error", resolve, { once: true });
				});
			}));
		});
		assertNotCancelled(job);

		updateJob(job, { progress: 82, message: "Writing PDF" });
		await page.pdf({
			path: job.outputPath,
			format: normalizePageSize(settings.pageSize),
			landscape: settings.orientation === "landscape",
			printBackground: true,
			preferCSSPageSize: false,
			margin: PAGE_MARGINS[settings.margin] || PAGE_MARGINS.normal,
			timeout: 120000,
		});

		updateJob(job, {
			status: "completed",
			progress: 100,
			currentPage: job.totalPages,
			message: "PDF ready",
			downloadUrl: `/api/reader/pdf-jobs/${job.id}/download`,
		});
	} finally {
		if (job.browser) {
			await job.browser.close().catch(() => {});
			job.browser = null;
		}
	}
}

function buildPrintableHtml(storyData, settings, baseUrl) {
	const language = settings.language === "hin" || settings.language === "eng" ? settings.language : "eng";
	const posts = storyData.posts?.[language] || storyData.posts?.eng || storyData.posts?.hin || {};
	const keys = Object.keys(posts).sort((a, b) => Number(a) - Number(b));
	const title = escapeHtml(storyData.meta?.storyName || storyData.storyName || storyData.title || "Story");
	const writer = escapeHtml(storyData.meta?.writerName || storyData["writer-name"] || storyData.writerName || "");
	const includeImages = settings.includeImages !== false;
	const body = keys.map((key) => {
		const html = includeImages ? absolutizeAssetUrls(posts[key] || "", baseUrl) : stripImages(posts[key] || "");
		return `<section class="story-page" data-page="${escapeHtml(key)}">${html}</section>`;
	}).join("\n");

	return `<!doctype html>
<html lang="${language === "hin" ? "hi" : "en"}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
@page { size: ${normalizePageSize(settings.pageSize)} ${settings.orientation === "landscape" ? "landscape" : "portrait"}; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #1f2933; background: #fff; font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.78; }
.story-document { max-width: 760px; margin: 0 auto; }
.story-header { margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #d8dee7; }
.story-header h1 { margin: 0; font-size: 30px; line-height: 1.25; }
.story-header p { margin: 8px 0 0; color: #667085; font-family: Arial, sans-serif; font-size: 13px; }
.story-page { break-inside: avoid; page-break-inside: avoid; padding: 18px 0; border-bottom: 1px dashed #d8dee7; }
.story-page:last-child { border-bottom: 0; }
p { margin: 0 0 1.1em; }
img { display: block; max-width: 100%; height: auto; margin: 18px auto; }
.bbCodeBlock { margin: 18px 0; padding: 12px 14px; background: #f6f7f9; border-left: 3px solid #98a2b3; font-family: Arial, sans-serif; font-size: 14px; }
</style>
</head>
<body>
<main class="story-document">
<header class="story-header"><h1>${title}</h1>${writer ? `<p>${writer}</p>` : ""}</header>
${body}
</main>
</body>
</html>`;
}

function getTotalPages(storyData, settings = {}) {
	const language = settings.language === "hin" || settings.language === "eng" ? settings.language : "eng";
	const posts = storyData.posts?.[language] || storyData.posts?.eng || storyData.posts?.hin || {};
	return Object.keys(posts).length;
}

function normalizePageSize(pageSize) {
	return ["A4", "Letter", "Legal"].includes(pageSize) ? pageSize : "A4";
}

function stripImages(html) {
	return String(html).replace(/<img\b[^>]*>/gi, "");
}

function absolutizeAssetUrls(html, baseUrl) {
	return String(html).replace(/\s(src|href)=["']([^"']+)["']/gi, (match, attr, value) => {
		if (/^(https?:|data:|blob:)/i.test(value)) return match;
		const absolute = new URL(value, baseUrl).toString();
		return ` ${attr}="${absolute}"`;
	});
}

function escapeHtml(value) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function assertNotCancelled(job) {
	if (job.cancelRequested) {
		const err = new Error("PDF generation stopped.");
		err.cancelled = true;
		throw err;
	}
}

function updateJob(job, patch) {
	Object.assign(job, patch, { updatedAt: Date.now() });
}

function serializeJob(job) {
	return {
		id: job.id,
		status: job.status,
		progress: job.progress,
		currentPage: job.currentPage,
		totalPages: job.totalPages,
		message: job.message,
		downloadUrl: job.downloadUrl,
		error: job.error,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
	};
}

module.exports = {
	createPdfJob,
	getPdfJob,
	cancelPdfJob,
	getPdfJobFile,
};
