const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
	buildImageIndexFromStory,
	getIndexStats,
	normalizeImageIndex,
} = require("../services/imageIndexService");
const { processStoryJsonImages } = require("../services/jsonImageProcessorService");

function createStory(html) {
	return {
		meta: { storyName: "Image test", writerName: "Tester" },
		fetch: {},
		stats: {},
		translation: {},
		errors: {},
		posts: { eng: { 1: html }, hin: {} },
	};
}

test("image index records packaged and pending images", () => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fetchstory-index-"));
	const imagesFolder = path.join(folder, "images");
	fs.mkdirSync(imagesFolder);
	fs.writeFileSync(path.join(imagesFolder, "saved.jpg"), Buffer.from("same-image"));

	const story = createStory([
		'<img src="images/saved.jpg" data-original-src="https://example.test/saved.jpg">',
		'<img src="https://example.test/pending.jpg">',
	].join(""));
	const imageIndex = buildImageIndexFromStory(story, folder);
	const stats = getIndexStats(imageIndex);

	assert.equal(stats.available, 1);
	assert.equal(stats.pending, 1);
	assert.equal(Object.keys(imageIndex.hashMap).length, 1);
	assert.equal(imageIndex.urlMap["https://example.test/saved.jpg"].startsWith("img_"), true);

	fs.rmSync(folder, { recursive: true, force: true });
});

test("processing reuses one file for different URLs with identical bytes", async () => {
	const bytes = Buffer.from("identical-image-content");
	const server = http.createServer((req, res) => {
		res.writeHead(200, {
			"Content-Type": "image/jpeg",
			"Content-Length": bytes.length,
		});
		res.end(bytes);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fetchstory-process-"));
	const story = createStory(
		`<img src="http://127.0.0.1:${port}/one.jpg"><img src="http://127.0.0.1:${port}/two.jpg">`,
	);

	try {
		const result = await processStoryJsonImages(story, folder);
		const files = fs.readdirSync(path.join(folder, "images"));
		const stats = getIndexStats(result.imageIndex);

		assert.equal(files.length, 1);
		assert.equal(result.stats.downloadedImages, 1);
		assert.equal(result.stats.duplicateImages, 1);
		assert.equal(stats.available, 1);
		assert.equal(Object.keys(result.imageIndex.urlMap).length, 2);
		assert.equal(
			result.imageIndex.urlMap[`http://127.0.0.1:${port}/one.jpg`],
			result.imageIndex.urlMap[`http://127.0.0.1:${port}/two.jpg`],
		);
	} finally {
		await new Promise((resolve) => server.close(resolve));
		fs.rmSync(folder, { recursive: true, force: true });
	}
});

test("strict image index rejects available entries without a safe path and hash", () => {
	assert.throws(
		() => normalizeImageIndex({
			version: 1,
			algorithm: "sha256",
			images: {
				bad: {
					id: "bad",
					status: "available",
					path: "../secret.jpg",
					sha256: "not-a-hash",
					originalUrls: [],
				},
			},
			urlMap: {},
			hashMap: {},
		}),
		/Unsafe image path/,
	);
});
