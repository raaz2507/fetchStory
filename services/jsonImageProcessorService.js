const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const { createImageCache, downloadImageWithHash } = require("./imageService");
const {
	createImageIndex,
	getHttpUrl,
	getIndexStats,
	markImageFailure,
	markMissingFiles,
	registerAvailableImage,
	registerPendingUrl,
} = require("./imageIndexService");

async function processStoryJsonImages(storyData, baseFolder, progressCallback, options = {}) {
	const story = normalizeStoryData(storyData);
	const imageIndex = markMissingFiles(options.imageIndex || createImageIndex(), baseFolder);
	const sections = ["eng", "hin"];
	const postQueue = sections.flatMap((sectionName) => {
		const posts = story.posts[sectionName];
		return Object.keys(posts)
			.sort((a, b) => Number(a) - Number(b))
			.map((postKey) => ({ sectionName, postKey }));
	});
	const stats = {
		totalImages: 0,
		downloadedImages: 0,
		skippedImages: 0,
		missingOriginalUrls: 0,
		processedPosts: 0,
		totalPosts: postQueue.length,
		processedImages: 0,
		alreadyAvailable: 0,
		duplicateImages: 0,
	};

	const imageCache = createImageCache(createCacheSeed(imageIndex, baseFolder));

	sendProgress(progressCallback, {
		...stats,
		message: "Scanning uploaded JSON images",
		overallPercent: 0,
		pagePercent: 0,
		imagePercent: 0,
	});

	for (const item of postQueue) {
		throwIfAborted(options.signal);
		const posts = story.posts[item.sectionName];
		sendProgress(progressCallback, {
			...stats,
			sectionName: item.sectionName,
			currentPostKey: item.postKey,
			message: `Processing post ${item.postKey}`,
			overallPercent: getPercent(stats.processedPosts, stats.totalPosts),
			pagePercent: 0,
			imagePercent: 0,
		});

		const result = await processHtmlImages(posts[item.postKey], baseFolder, stats, imageCache, imageIndex, options.signal, (imageProgress) => {
			sendProgress(progressCallback, {
				...stats,
				...imageProgress,
				sectionName: item.sectionName,
				currentPostKey: item.postKey,
				message: `Processing post ${item.postKey}`,
				overallPercent: getPercent(stats.processedPosts, stats.totalPosts),
				pagePercent: getPercent(imageProgress.currentImageIndex || 0, imageProgress.totalImagesOnCurrentPost || 0),
			});
		});
		posts[item.postKey] = result.html;
		stats.processedPosts++;

		sendProgress(progressCallback, {
			...stats,
			sectionName: item.sectionName,
			currentPostKey: item.postKey,
			message: `Post ${item.postKey} processed`,
			overallPercent: getPercent(stats.processedPosts, stats.totalPosts),
			pagePercent: 100,
			imagePercent: 100,
		});
	}

	story["total-image"] = stats.totalImages;
	story["image-downlaods"] = stats.downloadedImages;
	story.lastFetch = new Date().toISOString();

	return { storyData: story, imageIndex, stats: { ...stats, index: getIndexStats(imageIndex) } };
}

async function processHtmlImages(html, baseFolder, stats, imageCache, imageIndex, signal, progressCallback) {
	if (typeof html !== "string" || !html.includes("<img")) {
		return { html: html || "" };
	}

	const $ = cheerio.load(html, { decodeEntities: false });
	const images = $("img").toArray();
	stats.totalImages += images.length;

	for (let index = 0; index < images.length; index++) {
		throwIfAborted(signal);
		const img = images[index];
		const src = $(img).attr("src") || "";
		const dataOriginalSrc = $(img).attr("data-original-src") || "";
		const originalUrl = getHttpUrl(dataOriginalSrc) || getHttpUrl(src);

		if (!originalUrl) {
			stats.missingOriginalUrls++;
			stats.skippedImages++;
			stats.processedImages++;
			sendProgress(progressCallback, {
				currentImageIndex: index + 1,
				totalImagesOnCurrentPost: images.length,
				imagePercent: 100,
			});
			continue;
		}

		const indexedEntry = getAvailableEntryForUrl(imageIndex, originalUrl, baseFolder);
		if (indexedEntry) {
			$(img).attr("src", indexedEntry.path);
			$(img).attr("data-original-src", originalUrl);
			stats.alreadyAvailable++;
			stats.processedImages++;
			sendProgress(progressCallback, {
				currentImageIndex: index + 1,
				totalImagesOnCurrentPost: images.length,
				imagePercent: 100,
			});
			continue;
		}
		registerPendingUrl(imageIndex, originalUrl);

		try {
			const imageResult = await downloadImageWithHash(
				originalUrl,
				baseFolder,
				index + 1,
				images.length,
				originalUrl,
				signal,
				(downloadProgress) => {
					sendProgress(progressCallback, {
						currentImageIndex: downloadProgress.imageIndex || index + 1,
						totalImagesOnCurrentPost: downloadProgress.totalImages || images.length,
						imagePercent: downloadProgress.imagePercent || 0,
					});
				},
				imageCache,
			);
			const localPath = imageResult && imageResult.localPath;

			if (!localPath) {
				stats.skippedImages++;
				stats.processedImages++;
				continue;
			}

			$(img).attr("src", localPath);
			$(img).attr("data-original-src", originalUrl);

			registerAvailableImage(imageIndex, {
				path: localPath,
				sha256: imageResult.sha256,
				size: imageResult.size,
				originalUrl,
			});
			if (imageResult.wasDownloaded) {
				stats.downloadedImages++;
			} else if (imageResult.wasDuplicate) {
				stats.duplicateImages++;
			}
			stats.processedImages++;
		} catch (err) {
			if (err.name === "AbortError") {
				throw err;
			}
			stats.skippedImages++;
			stats.processedImages++;
			markImageFailure(imageIndex, originalUrl, err.message);
			console.log(`Uploaded JSON image skipped: ${originalUrl}`);
		} finally {
			sendProgress(progressCallback, {
				currentImageIndex: index + 1,
				totalImagesOnCurrentPost: images.length,
				imagePercent: 100,
			});
		}
	}

	return { html: $("body").html() || "" };
}

function createCacheSeed(imageIndex, baseFolder) {
	const savedHashes = [];
	const savedUrls = [];
	for (const entry of Object.values(imageIndex.images || {})) {
		if (entry.status !== "available" || !entry.path || !entry.sha256) continue;
		if (!fs.existsSync(path.join(baseFolder, entry.path))) continue;
		const cached = {
			localPath: entry.path,
			sha256: entry.sha256,
			size: entry.size,
			originalUrl: entry.originalUrls?.[0] || "",
		};
		savedHashes.push([entry.sha256, cached]);
		for (const url of entry.originalUrls || []) savedUrls.push([url, cached]);
	}
	return { savedHashes, savedUrls };
}

function getAvailableEntryForUrl(imageIndex, url, baseFolder) {
	const id = imageIndex.urlMap[url];
	const entry = id ? imageIndex.images[id] : null;
	if (!entry || entry.status !== "available" || !entry.path) return null;
	if (!fs.existsSync(path.join(baseFolder, entry.path))) {
		entry.status = "missing";
		return null;
	}
	return entry;
}

function normalizeStoryData(storyData) {
	const legacyHindiPosts = storyData.posts && storyData.posts.hindi
		? storyData.posts.hindi
		: {};
	const hindiPosts = storyData.posts && storyData.posts.hin
		? storyData.posts.hin
		: {};
	return {
		...storyData,
		posts: {
			eng: storyData.posts && storyData.posts.eng ? storyData.posts.eng : {},
			hin: {
				...legacyHindiPosts,
				...hindiPosts,
			},
		},
	};
}

function getPercent(current, total) {
	if (!total) return 100;
	return Math.max(0, Math.min(100, Math.floor((current / total) * 100)));
}

function sendProgress(progressCallback, payload) {
	if (!progressCallback) return;
	progressCallback(payload);
}

function throwIfAborted(signal) {
	if (!signal || !signal.aborted) return;

	const err = new Error("Image processing cancelled");
	err.name = "AbortError";
	throw err;
}

module.exports = { processStoryJsonImages };
