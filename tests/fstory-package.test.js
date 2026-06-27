const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const JSZip = require("jszip");

const { _createFetchStoryPackage } = require("../controllers/storyController");

test("server export creates a strict v2 package with image-index.json", async () => {
	const jobId = crypto.randomUUID();
	const jobFolder = path.join(__dirname, "..", "temp", "jobs", jobId);
	const imagesFolder = path.join(jobFolder, "images");
	fs.mkdirSync(imagesFolder, { recursive: true });
	fs.writeFileSync(path.join(imagesFolder, "saved.jpg"), Buffer.from("server-image"));
	const story = {
		meta: {
			url: "https://example.test/story",
			domain: "example.test",
			threadId: "1",
			storyName: "V2 Server Package",
			writerName: "Tester",
			status: "completed",
		},
		fetch: {},
		stats: {},
		translation: {},
		errors: {},
		posts: {
			eng: {
				1: `<img src="/temp/jobs/${jobId}/images/saved.jpg" data-original-src="https://example.test/saved.jpg"><img src="https://example.test/pending.jpg">`,
			},
			hin: {},
		},
	};
	fs.writeFileSync(path.join(jobFolder, "story_data.json"), JSON.stringify(story));

	try {
		const result = await _createFetchStoryPackage(jobId, story.meta.storyName);
		const zip = await JSZip.loadAsync(fs.readFileSync(result.packagePath));
		const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
		const imageIndexText = await zip.file("image-index.json").async("string");
		const imageIndex = JSON.parse(imageIndexText);

		assert.equal(manifest.formatVersion, 2);
		assert.equal(manifest.imageIndexFile, "image-index.json");
		assert.equal(
			crypto.createHash("sha256").update(imageIndexText).digest("hex"),
			manifest.integrity.imageIndexChecksum,
		);
		assert.equal(Object.values(imageIndex.images).filter((entry) => entry.status === "available").length, 1);
		assert.equal(Object.values(imageIndex.images).filter((entry) => entry.status === "pending").length, 1);
		assert.ok(zip.file("images/saved.jpg"));
	} finally {
		fs.rmSync(jobFolder, { recursive: true, force: true });
	}
});
