const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const cheerio = require("cheerio");

function loadPublicPage(fileName) {
	const html = fs.readFileSync(path.join(__dirname, "..", "public", fileName), "utf8");
	return cheerio.load(html);
}

test("index exposes only the strict FetchStory package workflow", () => {
	const $ = loadPublicPage("index.html");

	assert.equal($("#insertJsonBtn").length, 0);
	assert.equal($("#cleanUploadedJsonBtn").length, 0);
	assert.equal($("#downloadBtn").length, 0);
	assert.equal($("#insertFstoryBtn").length, 1);
	assert.equal($("#processUploadedImagesBtn").text().trim(), "Add / Update Images");
	assert.equal($("#downloadFstoryBtn").length, 1);
	assert.equal($(".siteInfoButton").length, 1);
	assert.match($("#supportedSitesTooltip").text(), /xforum\.live/);
	assert.match($("#supportedSitesTooltip").text(), /rajsharmastories\.com/);
});

test("reader removes JSON and loose image-folder inputs", () => {
	const $ = loadPublicPage("reader_template.html");

	assert.equal($("#jsonFile").length, 0);
	assert.equal($("#imageFolderPicker").length, 0);
	assert.equal($("#fstoryFile").length, 1);
	assert.equal($("#downloadFstoryBtn").length, 1);
	assert.equal($("#reader-tab-panel #fstoryFile").length, 1);
	assert.equal($("#translator-tab-panel #fstoryFile").length, 0);
	assert.equal($("#translator-tab-panel #downloadFstoryBtn").length, 1);
	assert.equal($("#reader-tab-panel #load-all-btn").length, 1);
	assert.equal($(".reader-header #logoutBtn").length, 1);
	assert.equal($("#toggle-text").text().trim(), "Options");
});

test("index keeps enough active fetch state to resume after refresh", () => {
	const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "index.js"), "utf8");

	assert.match(script, /ACTIVE_FETCH_KEY/);
	assert.match(script, /restoreInterruptedFetch/);
	assert.match(script, /params\.set\("jobId", jobId\)/);
	assert.match(script, /fetchStoryStream\(\{ resumeContext: context \}\)/);
});

test("reader reconnects to an active translation after refresh", () => {
	const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "reader.js"), "utf8");

	assert.match(script, /ACTIVE_TRANSLATION_KEY/);
	assert.match(script, /restoreActiveTranslation/);
	assert.match(script, /saveActiveTranslation/);
	assert.match(script, /watchTranslationProgress\(saved\.jobId\)/);
});

test("reader prepares long stories and images before printing", () => {
	const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "reader.js"), "utf8");

	assert.match(script, /prepareStoryForPrint/);
	assert.match(script, /Preparing PDF… \$\{this\.keyIndex\}\/\$\{total\} parts/);
	assert.match(script, /waitForPrintAssets/);
	assert.match(script, /image\.decode/);
	assert.match(script, /waitForRenderFrames\(2\)/);
});

test("reader sidebar exposes tracked PDF export controls", () => {
	const $ = loadPublicPage("reader_template.html");
	const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "reader.js"), "utf8");

	assert.equal($("#pdf-start-btn").length, 1);
	assert.equal($("#pdf-stop-btn").length, 1);
	assert.equal($("#pdf-progress-bar").length, 1);
	assert.equal($("#pdf-page-size").length, 1);
	assert.equal($("#pdf-download-link").length, 1);
	assert.match(script, /startPdfExport/);
	assert.match(script, /\/api\/reader\/pdf-jobs/);
	assert.match(script, /pollPdfJob/);
	assert.match(script, /stopPdfExport/);
});

test("admin scraped story list exposes individual and clear-all actions", () => {
	const $ = loadPublicPage("admin.html");
	const script = fs.readFileSync(path.join(__dirname, "..", "public", "js", "admin.js"), "utf8");

	assert.equal($("#clearScrapedStoriesBtn").length, 1);
	assert.match(script, /data-scraped-delete/);
	assert.match(script, /\/api\/admin\/scraped-stories/);
});
