const path = require("path");
const fs = require("fs");
const fsAsync = require("fs").promises;
const crypto = require("crypto");

const { sanitizeFolderName } = require("../utils/fileUtils");
const { getStoryMeta, scrapeStoryWithImages, scrapeDeletedStoryQuotes } = require("../services/scraperService");
const { createZip } = require("../services/exportService");
const { processStoryJsonImages } = require("../services/jsonImageProcessorService");
const { logMemory } = require("../utils/logger");
const {
	IMAGE_INDEX_FILE,
	buildImageIndexFromStory,
	normalizeImageIndex,
	readImageIndex,
	writeImageIndex,
} = require("../services/imageIndexService");




exports.downloadStory = async (req, res) => {
	try {
		const { title = "story" } = req.body;
		const jobId = getValidJobId(req.body && req.body.jobId);
		const names = createStoryFileNames(title);
		const tempFolder = getJobFolder(jobId);
		let sourceJsonPath = path.join(tempFolder, "story_data.json");

		if (!fs.existsSync(sourceJsonPath)) {
			const legacyJsonName = fs.existsSync(tempFolder)
				? fs.readdirSync(tempFolder, { withFileTypes: true })
					.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
				: null;
			if (legacyJsonName) {
				sourceJsonPath = path.join(tempFolder, legacyJsonName.name);
			} else {
				return res.status(404).send("No story data found to download. Please fetch first.");
			}
		}

		const storyData = JSON.parse(fs.readFileSync(sourceJsonPath, "utf8"));
		const imageFolderName = names.imageFolder;
		let sourceImagesPath = path.join(tempFolder, "images");
		if (!fs.existsSync(sourceImagesPath) && fs.existsSync(tempFolder)) {
			const legacyImagesFolder = fs.readdirSync(tempFolder, { withFileTypes: true })
				.find((entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith("_images"));
			if (legacyImagesFolder) {
				sourceImagesPath = path.join(tempFolder, legacyImagesFolder.name);
			}
		}
		const exportsFolder = path.join(tempFolder, "exports");
		const packageFolder = path.join(exportsFolder, names.baseName);
		const packageImagesPath = path.join(packageFolder, imageFolderName);
		const finalJsonPath = path.join(packageFolder, names.jsonFile);
		const zipPath = path.join(exportsFolder, names.zipFile);

		// Package a copy and keep the fetched source intact for retries,
		// append operations, and alternative .fstory downloads.
		fs.mkdirSync(packageFolder, { recursive: true });
		if (fs.existsSync(packageImagesPath)) {
			fs.rmSync(packageImagesPath, { recursive: true, force: true });
		}
		if (fs.existsSync(sourceImagesPath)) {
			fs.cpSync(sourceImagesPath, packageImagesPath, { recursive: true });
		}

		const jsonText = rewriteImagePathsForDownload(
			JSON.stringify(storyData, null, 2),
			jobId,
			imageFolderName,
		);
		fs.writeFileSync(finalJsonPath, jsonText, "utf8");

		await createZip(packageFolder, zipPath);

		if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
			throw new Error("Zip creation failed or file is 0 bytes.");
		}

		res.download(zipPath, names.zipFile, (err) => {
			if (err) {
				console.error("Error during file transfer:", err);
			}
		});
	} catch (err) {
		console.error("Download Error:", err);
		if (!res.headersSent) {
			res.status(err.statusCode || 500).send("Download failed: " + err.message);
		}
	}
};

exports.downloadFetchStory = async (req, res) => {
	try {
		const { title = "story" } = req.body;
		const jobId = getValidJobId(req.body && req.body.jobId);
		const result = await createFetchStoryPackage(jobId, title);

		res.download(result.packagePath, result.fileName, (err) => {
			if (err) {
				console.error("FetchStory transfer error:", err);
			}
		});
	} catch (err) {
		console.error("FetchStory download error:", err);
		if (!res.headersSent) {
			res.status(err.statusCode || 500).send("FetchStory download failed: " + err.message);
		}
	}
};

exports.getJobStory = (req, res) => {
	try {
		const jobId = getValidJobId(req.params && req.params.jobId);
		const jsonFilePath = path.join(getJobFolder(jobId), "story_data.json");
		if (!fs.existsSync(jsonFilePath)) {
			return res.status(404).json({ error: "Story data not found" });
		}
		return res.json({
			ok: true,
			jobId,
			storyData: normalizeStoryData(JSON.parse(fs.readFileSync(jsonFilePath, "utf8"))),
		});
	} catch (err) {
		return res.status(err.statusCode || 500).json({ error: err.message });
	}
};

function rewriteImagePathsForDownload(jsonText, jobId, imageFolderName) {
	return jsonText
		.replace(
			new RegExp(`/temp/jobs/${escapeRegExp(jobId)}/images/`, "g"),
			`${imageFolderName}/`
		)
		.replace(/\/temp\/images\//g, `${imageFolderName}/`)
		.replace(/src=["']\.\/images\//g, `src="${imageFolderName}/`)
		.replace(/src=["']images\//g, `src="${imageFolderName}/`);
}

function createStoryFileNames(title) {
	const baseName = sanitizeFolderName(title, "default");

	return {
		baseName,
		jsonFile: `${sanitizeFolderName(baseName, "json")}.json`,
		imageFolder: `${sanitizeFolderName(baseName, "images")}_images`,
		zipFile: `${sanitizeFolderName(baseName, "zip")}.zip`,
	};
}

async function createFetchStoryPackage(jobId, title) {
	const tempFolder = getJobFolder(jobId);
	const sourceJsonPath = path.join(tempFolder, "story_data.json");
	if (!fs.existsSync(sourceJsonPath)) {
		const err = new Error("No story data found to download. Please fetch first.");
		err.statusCode = 404;
		throw err;
	}

	const storyData = normalizeStoryData(JSON.parse(fs.readFileSync(sourceJsonPath, "utf8")));
	const storyTitle = storyData.meta.storyName || title || "story";
	const names = createStoryFileNames(storyTitle);
	const exportsFolder = path.join(tempFolder, "exports");
	const packageFolder = path.join(exportsFolder, `${names.baseName}_fstory`);
	const packageImagesPath = path.join(packageFolder, "images");
	const manifestPath = path.join(packageFolder, "manifest.json");
	const imageIndexPath = path.join(packageFolder, IMAGE_INDEX_FILE);
	const contentFile = `${sanitizeFolderName(names.baseName, "json")}.json`;
	const contentPath = path.join(packageFolder, contentFile);
	const packagePath = path.join(exportsFolder, `${names.baseName}.fstory`);
	const previousManifest = readJsonIfExists(manifestPath);
	const now = new Date().toISOString();

	if (fs.existsSync(packageFolder)) {
		fs.rmSync(packageFolder, { recursive: true, force: true });
	}
	fs.mkdirSync(packageFolder, { recursive: true });
	fs.mkdirSync(packageImagesPath, { recursive: true });
	const sourceImagesPath = path.join(tempFolder, "images");
	if (fs.existsSync(sourceImagesPath)) {
		fs.cpSync(sourceImagesPath, packageImagesPath, { recursive: true });
	}

	const packagedStory = normalizeStoryData(JSON.parse(JSON.stringify(storyData)));
	rewriteStoryImagePaths(packagedStory, jobId, "images");
	const storyText = JSON.stringify(packagedStory, null, 2);
	const sourceImageIndexPath = path.join(tempFolder, IMAGE_INDEX_FILE);
	const imageIndex = fs.existsSync(sourceImageIndexPath)
		? readImageIndex(sourceImageIndexPath, true)
		: buildImageIndexFromStory(packagedStory, packageFolder);
	const packagedImageIndex = reconcilePackagedImageIndex(imageIndex, packagedStory, packageFolder);
	const imageIndexText = JSON.stringify(packagedImageIndex, null, 2);
	const engCount = Object.keys(packagedStory.posts.eng || {}).length;
	const hinCount = Object.keys(packagedStory.posts.hin || {}).length;
	const manifest = {
		format: "fetchstory",
		formatVersion: 2,
		storyId: previousManifest && previousManifest.storyId
			? previousManifest.storyId
			: crypto.randomUUID(),
		title: packagedStory.meta.storyName || storyTitle,
		author: packagedStory.meta.writerName || "",
		sourceUrl: packagedStory.meta.url || "",
		sourceDomain: packagedStory.meta.domain || "",
		contentFile,
		imagesFolder: "images/",
		imageIndexFile: IMAGE_INDEX_FILE,
		languages: hinCount ? ["eng", "hin"] : ["eng"],
		defaultLanguage: previousManifest && previousManifest.defaultLanguage
			? previousManifest.defaultLanguage
			: "eng",
		translation: {
			status: hinCount === 0 ? "none" : hinCount >= engCount ? "complete" : "partial",
			translatedPosts: hinCount,
			engineVersion: String(
				packagedStory.translation.dictionaryVersion
				|| (previousManifest && previousManifest.translation && previousManifest.translation.engineVersion)
				|| "1",
			),
			updatedAt: hinCount ? now : null,
		},
		createdAt: previousManifest && previousManifest.createdAt
			? previousManifest.createdAt
			: now,
		updatedAt: now,
		integrity: {
			storyChecksum: crypto.createHash("sha256").update(storyText).digest("hex"),
			imageIndexChecksum: crypto.createHash("sha256").update(imageIndexText).digest("hex"),
		},
	};

	fs.writeFileSync(contentPath, storyText, "utf8");
	fs.writeFileSync(imageIndexPath, imageIndexText, "utf8");
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
	await createZip(packageFolder, packagePath);

	if (!fs.existsSync(packagePath) || fs.statSync(packagePath).size === 0) {
		throw new Error("FetchStory package creation failed or file is empty.");
	}

	return {
		packagePath,
		fileName: `${names.baseName}.fstory`,
		manifest,
	};
}

exports._createFetchStoryPackage = createFetchStoryPackage;

function rewriteStoryImagePaths(storyData, jobId, imagesFolder) {
	for (const section of ["eng", "hin"]) {
		const posts = storyData.posts[section] || {};
		for (const key of Object.keys(posts)) {
			posts[key] = rewriteImagePathsForDownload(
				String(posts[key] || ""),
				jobId,
				imagesFolder,
			);
		}
	}
}

function reconcilePackagedImageIndex(existingIndex, storyData, packageFolder) {
	const rebuilt = buildImageIndexFromStory(storyData, packageFolder);
	for (const entry of Object.values(existingIndex.images || {})) {
		for (const url of entry.originalUrls || []) {
			if (rebuilt.urlMap[url]) continue;
			const id = entry.id || `url_${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
			rebuilt.images[id] = {
				...entry,
				id,
				status: entry.status === "available" ? "missing" : entry.status,
				path: entry.status === "available" ? null : entry.path,
				sha256: entry.status === "available" ? null : entry.sha256,
			};
			rebuilt.urlMap[url] = id;
		}
	}
	rebuilt.updatedAt = new Date().toISOString();
	return rebuilt;
}

function readJsonIfExists(filePath) {
	try {
		return fs.existsSync(filePath)
			? JSON.parse(fs.readFileSync(filePath, "utf8"))
			: null;
	} catch (err) {
		console.warn("Existing package manifest ignored:", err.message);
		return null;
	}
}

exports.storyMeta = async (req, res) => {
	try {
		const meta = await getStoryMeta(req.query.url);
		res.json(meta);
	} catch (err) {
		console.error(err);
		res.status(400).json({ error: getClientErrorMessage(err) });
	}
};

exports.uploadStoryJson = async (req, res) => {
	try {
		const uploadedData = req.body && req.body.storyData;
		if (!uploadedData || typeof uploadedData !== "object" || Array.isArray(uploadedData)) {
			return res.status(400).json({ error: "Valid JSON story data missing" });
		}

		const jobId = createJobId();
		const tempFolder = getJobFolder(jobId);
		const imagesPath = path.join(tempFolder, "images");
		const jsonFilePath = path.join(tempFolder, "story_data.json");
		const imageIndexPath = path.join(tempFolder, IMAGE_INDEX_FILE);

		fs.mkdirSync(imagesPath, { recursive: true });

		const storyData = normalizeStoryData(uploadedData);
		const imageIndex = req.body.imageIndex
			? normalizeImageIndex(req.body.imageIndex)
			: buildImageIndexFromStory(storyData, tempFolder);
		writeStoryDataFile(jsonFilePath, storyData);
		writeImageIndex(imageIndexPath, imageIndex);

		res.json({
			ok: true,
			jobId,
			storyData,
			imageIndex,
			meta: createStorySummary(storyData),
		});
	} catch (err) {
		console.error("JSON upload error:", err);
		res.status(400).json({ error: err.message || "JSON upload failed" });
	}
};

exports.cleanUploadedStoryJson = async (req, res) => {
	try {
		const jobId = getValidJobId(req.body && req.body.jobId);
		const tempFolder = getJobFolder(jobId);
		const jsonFilePath = path.join(tempFolder, "story_data.json");

		if (!fs.existsSync(jsonFilePath)) {
			return res.status(404).json({ error: "Upload JSON first" });
		}

		const storyData = normalizeStoryData(JSON.parse(fs.readFileSync(jsonFilePath, "utf8")));
		writeStoryDataFile(jsonFilePath, storyData);

		res.json({
			ok: true,
			jobId,
			storyData,
			meta: createStorySummary(storyData),
		});
	} catch (err) {
		console.error("Uploaded JSON clean error:", err);
		res.status(err.statusCode || 500).json({ error: "JSON clean failed: " + err.message });
	}
};

exports.processUploadedStoryImages = async (req, res) => {
	try {
		const jobId = getValidJobId(req.body && req.body.jobId);
		const tempFolder = getJobFolder(jobId);
		const imagesPath = path.join(tempFolder, "images");
		const jsonFilePath = path.join(tempFolder, "story_data.json");
		const imageIndexPath = path.join(tempFolder, IMAGE_INDEX_FILE);

		if (!fs.existsSync(jsonFilePath)) {
			return res.status(404).json({ error: "Upload JSON first" });
		}

		fs.mkdirSync(imagesPath, { recursive: true });

		const storyData = normalizeStoryData(JSON.parse(fs.readFileSync(jsonFilePath, "utf8")));
		const imageIndex = readImageIndex(imageIndexPath);
		const result = await processStoryJsonImages(storyData, tempFolder, null, { imageIndex });

		writeStoryDataFile(jsonFilePath, result.storyData);
		writeImageIndex(imageIndexPath, result.imageIndex);

		res.json({
			ok: true,
			jobId,
			storyData: result.storyData,
			imageIndex: result.imageIndex,
			meta: createStorySummary(result.storyData),
			stats: result.stats,
		});
	} catch (err) {
		console.error("Uploaded JSON image processing error:", err);
		res.status(err.statusCode || 500).json({ error: "Image processing failed: " + err.message });
	}
};

exports.streamUploadedStoryImages = async (req, res) => {
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.flushHeaders();

	const controller = new AbortController();
	res.on("error", (err) => {
		console.error("Uploaded image stream response error:", err.message);
		controller.abort();
	});
	req.on("close", () => {
		controller.abort();
	});

	try {
		const jobId = getValidJobId(req.query && req.query.jobId);
		const tempFolder = getJobFolder(jobId);
		const imagesPath = path.join(tempFolder, "images");
		const jsonFilePath = path.join(tempFolder, "story_data.json");
		const imageIndexPath = path.join(tempFolder, IMAGE_INDEX_FILE);

		if (!fs.existsSync(jsonFilePath)) {
			writeSseEvent(res, { error: "Upload JSON first", jobId }, controller);
			return res.end();
		}

		fs.mkdirSync(imagesPath, { recursive: true });

		const storyData = normalizeStoryData(JSON.parse(fs.readFileSync(jsonFilePath, "utf8")));
		const imageIndex = readImageIndex(imageIndexPath);
		const result = await processStoryJsonImages(
			storyData,
			tempFolder,
			(progressData) => {
				if (controller.signal.aborted) return;
				writeSseEvent(res, { ...progressData, jobId }, controller);
			},
			{ signal: controller.signal, imageIndex },
		);

		writeStoryDataFile(jsonFilePath, result.storyData);
		writeImageIndex(imageIndexPath, result.imageIndex);

		if (
			writeSseEvent(
				res,
				{
					done: true,
					jobId,
					storyData: result.storyData,
					imageIndex: result.imageIndex,
					meta: createStorySummary(result.storyData),
					stats: result.stats,
				},
				controller,
			)
		) {
			res.end();
		}
	} catch (err) {
		console.error("Uploaded JSON image processing stream error:", err);
		if (writeSseEvent(res, { error: "Image processing failed: " + err.message }, controller)) {
			res.end();
		}
	}
};

exports.streamStory = async (req, res) => {
	// 1. SSE Headers सेट करें
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.flushHeaders();

	const controller = new AbortController();
	res.on("error", (err) => {
		console.error("Story stream response error:", err.message);
		controller.abort();
	});
	req.on("close", () => {
		console.log("Client closed connection, aborting...");
		controller.abort();
	});

	const { url, author } = req.query;
	const requestedStartPage = parsePositiveInteger(req.query.startPage) || 1;
	const endPage = parsePositiveInteger(req.query.endPage) || 0;
	const loadImages = req.query.loadImages !== "0";
	const imageConcurrency = clampInteger(req.query.imageConcurrency, 3, 1, 10);
	const imageRetries = clampInteger(req.query.imageRetries, 3, 1, 5);
	const deletedMode = req.query.mode === "deleted";
	const appendMode = req.query.append === "1";
	const requestedJobId = req.query.jobId ? getValidJobId(req.query.jobId) : "";
	const jobId = requestedJobId || createJobId();

	const tempFolder = getJobFolder(jobId);
	const imagesPath = path.join(tempFolder, "images");
	const jsonFilePath = path.join(tempFolder, "story_data.json");
	const startedAt = new Date();
	let writeStoryJson = null;

	try {
		const existingStoryData = appendMode ? readExistingStoryData(jsonFilePath) : null;
		const existingUrl = existingStoryData && existingStoryData.meta
			? existingStoryData.meta.url
			: existingStoryData && existingStoryData.url;
		const effectiveAppendMode = appendMode && existingStoryData && isSameStorySource(existingUrl, url);
		const resumePage = effectiveAppendMode ? Number(existingStoryData.fetch.lastPageNo || 0) : 0;
		const startPage = effectiveAppendMode && resumePage > 0 ? resumePage : requestedStartPage;

		// 2. पुराने फाइलों को साफ़ करें
		if (effectiveAppendMode) {
			fs.mkdirSync(imagesPath, { recursive: true });
		} else {
			cleanTempFolder(tempFolder);
		}

		// 3. JSON का शुरुआती ढांचा canonical eng और hin फॉर्मेट में सेट किया
		const storyObj = effectiveAppendMode ? existingStoryData : createStoryDataShell(url, author, startedAt);
		ensureStoryDataMeta(storyObj, url, author, startedAt);
		
		storyObj.fetch.startTime = startedAt.toISOString();
		storyObj.fetch.endTime = "";
		storyObj.fetch.durationMs = 0;
		storyObj.fetch.durationText = "";
		storyObj.fetch.lastFetch = startedAt.toISOString();
		storyObj.meta.status = "fetching";

		writeStoryDataFile(jsonFilePath, storyObj);
		let liveStoryJson = storyObj;

		console.log("Starting scraper for URL:", url);
		logMemory("story stream started");
		const postNumberMap = new Map();
		const postImageCountMap = new Map();
		const knownPostNumbers = new Set(Object.keys(storyObj.posts.eng));
		for (const postNumber of knownPostNumbers) {
			postImageCountMap.set(postNumber, countImagesInHtml(storyObj.posts.eng[postNumber]));
		}
		let livePostCount = knownPostNumbers.size;
		let liveTotalImages = [...postImageCountMap.values()].reduce((total, count) => total + count, 0);
		let lastKnownPage = Number(storyObj.fetch.lastPageNo || 0);
		let nextPostNumber = getNextPostNumber(storyObj.posts.eng);
		const baseDownloadedImages = effectiveAppendMode ? Number(existingStoryData.stats.imageDownloads || 0) : 0;
		writeStoryJson = createJsonWriteBuffer(jsonFilePath);

		// 4. स्क्रैपर को रन करें
		const scrapeRunner = deletedMode ? scrapeDeletedStoryQuotes : scrapeStoryWithImages;
		await scrapeRunner( url, author, tempFolder, (progressData) => {
				let shouldWriteStoryJson = false;
				try {
					if (progressData) {
						// हर बार फाइल को सुरक्षित रीड करें
						let currentJson = liveStoryJson;

						// ढांचा सुनिश्चित करें (Safety Check)
						if (!currentJson.posts) currentJson.posts = { eng: {}, hin: {} };
						if (!currentJson.posts.eng) currentJson.posts.eng = {};
						if (!currentJson.posts.hin) currentJson.posts.hin = {};
						ensureStoryDataMeta(currentJson, url, author, startedAt);

						// कहानी का नाम अपडेट करें
						currentJson.meta.storyName = progressData.title || progressData.storyName || currentJson.meta.storyName;
						currentJson.meta.writerName = progressData.writerName || currentJson.meta.writerName;
						currentJson.fetch.totalPage = progressData.totalPages || currentJson.fetch.totalPage;
						currentJson.fetch.lastFetch = new Date().toISOString();
						currentJson.stats.totalImages = progressData.totalImages || currentJson.stats.totalImages || 0;
						currentJson.stats.imageDownloads = baseDownloadedImages + (progressData.downloadedImages || 0);
						progressData.downloadedImages = currentJson.stats.imageDownloads;
						
						
						
						if (progressData.currentPage && progressData.currentPage !== lastKnownPage) {
							lastKnownPage = progressData.currentPage;
							shouldWriteStoryJson = lastKnownPage % 25 === 0;
						}
						currentJson.fetch.lastPageNo = lastKnownPage || currentJson.fetch.lastPageNo || 0;
						currentJson.fetch.fetchedPages = currentJson.fetch.lastPageNo;

						// 🚨 [सुधार]: सुपर डायनामिक कन्टेंट डिटेक्टर (matchedPosts पर निर्भरता खत्म)
						let contentHtml = progressData.html || progressData.content || (progressData.post ? progressData.post.html : null);

						if (contentHtml && contentHtml.trim() !== "") {
							// पोस्ट का नंबर तय करें (अगर matchedPosts 0 या मिसिंग है, तो JSON की लेंथ से इंडेक्स ऑटो-इन्क्रीमेंट करें)
							const localPostNum = progressData.matchedPosts || progressData.currentPage || progressData.page;
							let currentPostNum = postNumberMap.get(localPostNum);

							if (!currentPostNum) {
								currentPostNum = effectiveAppendMode
									? findPostNumberByHtml(currentJson.posts.eng, contentHtml)
									: null;
								if (!currentPostNum) currentPostNum = nextPostNumber++;
								postNumberMap.set(localPostNum, currentPostNum);
							}

							// डेटा असाइन करें
							const currentPostKey = String(currentPostNum);
							const postHtmlChanged = currentJson.posts.eng[currentPostKey] !== contentHtml;
							currentJson.posts.eng[currentPostKey] = contentHtml;
							currentJson.stats.totalPosts = Object.keys(currentJson.posts.eng).length;
							currentJson.stats.totalWords = countWordsInPosts(currentJson.posts.eng);
							currentJson.stats.totalCharacters = countCharactersInPosts(currentJson.posts.eng);
							currentJson.stats.averagePostsPerPage = currentJson.fetch.fetchedPages ? Number((currentJson.stats.totalPosts / currentJson.fetch.fetchedPages).toFixed(2)) : 0;
							currentJson.stats.averageWordsPerPost = currentJson.stats.totalPosts ? Number((currentJson.stats.totalWords / currentJson.stats.totalPosts).toFixed(2)) : 0;
							
							if (!knownPostNumbers.has(currentPostKey)) {
								knownPostNumbers.add(currentPostKey);
								livePostCount++;
								shouldWriteStoryJson = true;
							}
							const previousImageCount = postImageCountMap.get(currentPostKey) || 0;
							const nextImageCount = countImagesInHtml(contentHtml);
							postImageCountMap.set(currentPostKey, nextImageCount);
							liveTotalImages += nextImageCount - previousImageCount;
							progressData.currentPostNum = Number(currentPostNum);
							progressData.matchedPosts = livePostCount;
							currentJson.stats.totalImages = liveTotalImages;
							progressData.totalImages = currentJson.stats.totalImages;

							// फाइल में डेटा फ़ोर्स राइट करें
							if (postHtmlChanged) {
								shouldWriteStoryJson = true;
								console.log(`📝 [JSON UPDATED] Part ${currentPostNum} successfully saved to story_data.json`);
							} else {
								delete progressData.html;
							}
						} else {
							console.log("⚠️ Progress received, but no valid HTML content found.");
						}
						liveStoryJson = currentJson;
						if (shouldWriteStoryJson) {
							writeStoryJson(liveStoryJson);
						}
					}
				} catch (writeErr) {
					console.error("Error writing post to JSON:", writeErr.message);
				}

				// फ्रंटएंड को लाइव डेटा भेजें
				if (progressData) progressData.jobId = jobId;
				writeSseEvent(res, progressData, controller);
			},
			{
				startPage,
				endPage,
				loadImages,
				imageConcurrency,
				imageRetries,
				signal: controller.signal,
				publicBasePath: `/temp/jobs/${jobId}`,
			},
		);

		// 5. काम पूरा होने पर 'done' भेजें
		flushStoryJson(writeStoryJson);
		const finalStoryData = safeFinalizeStoryDataFile(jsonFilePath, url, author, startedAt);
		logMemory("story stream completed");

		if (writeSseEvent(res, { done: true, jobId, meta: createStorySummary(finalStoryData) }, controller)) {
			res.end();
		}
	} catch (err) {
		flushStoryJson(writeStoryJson);
		safeFinalizeStoryDataFile(jsonFilePath, url, author, startedAt, {
			interrupted: err.code === "FETCH_CANCELLED",
		});
		console.error("=== CRITICAL SCRAPER ERROR ===");
		console.error(err);
		console.error("==============================");
		logMemory("story stream failed", "warn");

		if (writeSseEvent(res, { error: getClientErrorMessage(err), jobId }, controller)) {
			res.end();
		}
	}
};

exports.getSinglePage = async (req, res) => {
	try {
		const pageNum = Number(req.query.page) || 1;
		const jobId = getValidJobId(req.query.jobId);
		const jsonFilePath = path.join(getJobFolder(jobId), "story_data.json");

		if (!fs.existsSync(jsonFilePath)) {
			return res.status(404).json({ error: "Story data not found. Please scrape first." });
		}

		// फ़ाइल को रीड करें
		const fileContent = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

		if (!fileContent.posts || !fileContent.posts.eng || !fileContent.posts.eng[pageNum]) {
			return res.status(404).json({ error: "Post not available yet" });
		}

		let pageHtml = fileContent.posts.eng[pageNum];

		// इमेज पाथ फिक्सिंग (लाइव स्ट्रीमिंग रीडर के लिए)
		pageHtml = fixJobImagePaths(pageHtml, jobId);

		const hasNextPage = !!fileContent.posts.eng[pageNum + 1] || pageNum < fileContent.fetch.totalPage || fileContent.meta.storyName === "Loading..."

		// रिस्पॉन्स भेजें
		res.json({
			storyName: fileContent.meta.storyName,
			page: pageNum,
			html: pageHtml,
			hasNextPage: hasNextPage,
		});

		pageHtml = null;
	} catch (err) {
		console.error("Error in getSinglePage:", err);
		res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Error fetching page from server" });
	}
};

function logMemoryUsage(page) {
	const used = process.memoryUsage().heapUsed / 1024 / 1024;
	console.log(`Page ${page} Written to JSON. Memory cleaned. Current RAM usage: ${Math.round(used * 100) / 100} MB`);
}

function cleanTempFolder(tempPath) {
	const imagesPath = path.join(tempPath, "images");
	const jsonFilePath = path.join(tempPath, "story_data.json");

	try {
		fs.mkdirSync(tempPath, { recursive: true });

		if (fs.existsSync(jsonFilePath)) {
			fs.rmSync(jsonFilePath, { force: true });
		}

		if (fs.existsSync(imagesPath)) {
			for (const imageFile of fs.readdirSync(imagesPath)) {
				fs.rmSync(path.join(imagesPath, imageFile), { recursive: true, force: true });
			}
		}
	} catch (err) {
		console.log("Warning: Could not delete old temp files, skipping clean up:", err.message);
	}
}

function fixJobImagePaths(html, jobId) {
	if (typeof html !== "string") return "";
	const jobImagePath = `/temp/jobs/${jobId}/images/`;

	return html
		.replace(/src="\/temp\/images\//g, `src="${jobImagePath}`)
		.replace(/src="images\//g, `src="${jobImagePath}`)
		.replace(/src="\.\/images\//g, `src="${jobImagePath}`);
}

function createJobId() {
	return crypto.randomUUID();
}

function getValidJobId(value) {
	const jobId = String(value || "").trim();
	if (!/^[a-f0-9-]{36}$/i.test(jobId)) {
		const err = new Error("Valid jobId missing");
		err.statusCode = 400;
		throw err;
	}
	return jobId;
}

function getJobFolder(jobId) {
	return path.join(__dirname, "..", "temp", "jobs", jobId);
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function copyFilesInBatches(items, batchSize, worker) {
	for (let index = 0; index < items.length; index += batchSize) {
		const batch = items.slice(index, index + batchSize);
		await Promise.all(batch.map(worker));
	}
}

function getStorySourceInfo(inputUrl) {
	try {
		const parsed = new URL(inputUrl);
		const domain = parsed.hostname.replace(/^www\./, "").toLowerCase();

		const threadId =
			parsed.pathname.match(/\.(\d+)\//)?.[1] ||
			parsed.pathname.match(/thread-(\d+)/i)?.[1] ||
			parsed.searchParams.get("t") ||
			"";

		return { domain, threadId };
	} catch {
		return { domain: "", threadId: "" };
	}
}

function createStoryDataShell(url, author, startedAt) {
	const source = getStorySourceInfo(url);

	return {
		meta: {
			url: url || "",
			domain: source.domain,
			threadId: source.threadId,
			storyName: "Loading...",
			writerName: author || "",
			status: "fetching",
		},
		fetch: {
			totalPage: 0,
			lastPageNo: 0,
			fetchedPages: 0,
			failedPages: [],
			lastFetch: startedAt.toISOString(),
			startTime: startedAt.toISOString(),
			endTime: "",
			durationMs: 0,
			durationText: "",
		},
		stats: {
			totalPosts: 0,
			totalWords: 0,
			totalCharacters: 0,
			totalImages: 0,
			imageDownloads: 0,
			averagePostsPerPage: 0,
			averageWordsPerPost: 0,
		},
		translation: {
			isTranslated: false,
			translatedAt: null,
			translatedWords: 0,
			notTranslatedWords: 0,
			dictionaryVersion: null,
		},
		errors: {
			hasError: false,
			errorCount: 0,
			lastError: null,
			failedPages: [],
			failedImages: [],
		},
		posts: {
			eng: {},
			hin: {},
		},
	};
}

function normalizeStoryData(storyData) {
	if (!storyData || typeof storyData !== "object" || Array.isArray(storyData)) {
		throw new Error("Invalid story JSON");
	}

	if (!storyData.meta || !storyData.fetch || !storyData.stats || !storyData.posts) {
		throw new Error("Invalid new story structure");
	}

	storyData.posts.eng = storyData.posts.eng || {};
	storyData.posts.hin = storyData.posts.hin || {};

	return storyData;
}

function readExistingStoryData(jsonFilePath) {
	if (!fs.existsSync(jsonFilePath)) return null;

	try {
		return normalizeStoryData(JSON.parse(fs.readFileSync(jsonFilePath, "utf8")));
	} catch (err) {
		console.error("Existing JSON read failed:", err.message);
		return null;
	}
}

function isSameStorySource(existingUrl, requestedUrl) {
	return getStorySourceKey(existingUrl) === getStorySourceKey(requestedUrl);
}

function getStorySourceKey(inputUrl) {
	if (!inputUrl) return "";

	try {
		const parsed = new URL(inputUrl);
		const domain = parsed.hostname.replace(/^www\./, "").toLowerCase();

		if (domain === "rajsharmastories.com") {
			return `${domain}:topic:${parsed.searchParams.get("t") || parsed.pathname}`;
		}

		if (domain === "xossipy.com") {
			return `${domain}:${parsed.pathname.replace(/-page-\d+\.html$/i, ".html")}`;
		}

		return `${domain}:${parsed.pathname.replace(/\/page-\d+\/?$/i, "").replace(/\/?$/, "/")}`;
	} catch (err) {
		return String(inputUrl).trim();
	}
}

function getNextPostNumber(posts) {
	const keys = Object.keys(posts)
		.map((key) => Number.parseInt(key, 10))
		.filter((key) => Number.isInteger(key) && key > 0);

	return keys.length ? Math.max(...keys) + 1 : 1;
}

function findPostNumberByHtml(posts, html) {
	const target = normalizeHtmlForDuplicate(html);
	if (!target) return null;

	return (
		Object.keys(posts).find((key) => {
			return normalizeHtmlForDuplicate(posts[key]) === target;
		}) || null
	);
}

function normalizeHtmlForDuplicate(html) {
	if (typeof html !== "string") return "";

	return html
		.replace(/src="(?:\/temp\/)?images\//g, 'src="images/')
		.replace(/src="\.\/images\//g, 'src="images/')
		.replace(/\s+src="[^"]*"/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function createJsonWriteBuffer(jsonFilePath) {
	const minWriteIntervalMs = 10000;
	let pendingJson = null;
	let lastWriteAt = 0;

	const writeNow = () => {
		if (!pendingJson) return;

		writeStoryDataFile(jsonFilePath, pendingJson);
		pendingJson = null;
		lastWriteAt = Date.now();
	};

	const bufferedWrite = (storyData) => {
		pendingJson = storyData;

		if (Date.now() - lastWriteAt >= minWriteIntervalMs) {
			writeNow();
		}
	};

	bufferedWrite.flush = writeNow;

	return bufferedWrite;
}

function flushStoryJson(writeStoryJson) {
	if (!writeStoryJson) return;

	try {
		writeStoryJson.flush();
	} catch (err) {
		console.error("Final JSON flush failed:", err.message);
	}
}

function safeFinalizeStoryDataFile(jsonFilePath, url, author, startedAt, options = {}) {
	try {
		return finalizeStoryDataFile(jsonFilePath, url, author, startedAt, options);
	} catch (err) {
		console.error("Final story_data.json update failed:", err.message);
		return null;
	}
}

function writeSseEvent(res, payload, controller) {
	if (res.writableEnded || res.destroyed) return false;

	try {
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
		return true;
	} catch (err) {
		console.error("SSE write failed:", err.message);
		if (controller) controller.abort();
		return false;
	}
}

function countImagesInPosts(posts) {
	return Object.values(posts).reduce((count, html) => {
		return count + countImagesInHtml(html);
	}, 0);
}

function countImagesInHtml(html) {
	if (typeof html !== "string") return 0;
	const matches = html.match(/<img\b/gi);
	return matches ? matches.length : 0;
}

function ensureStoryDataMeta(storyData, url, author, startedAt) {
	const source = getStorySourceInfo(url);

	if (!storyData.meta) storyData.meta = {};
	if (!storyData.fetch) storyData.fetch = {};
	if (!storyData.stats) storyData.stats = {};
	if (!storyData.translation) storyData.translation = {};
	if (!storyData.errors) storyData.errors = {};
	if (!storyData.posts) storyData.posts = { eng: {}, hin: {} };

	storyData.meta.url = storyData.meta.url || url || "";
	storyData.meta.domain = storyData.meta.domain || source.domain;
	storyData.meta.threadId = storyData.meta.threadId || source.threadId;
	storyData.meta.storyName = storyData.meta.storyName || "Loading...";
	storyData.meta.writerName = storyData.meta.writerName || author || "";
	storyData.meta.status = storyData.meta.status || "fetching";

	storyData.fetch.totalPage = storyData.fetch.totalPage || 0;
	storyData.fetch.lastPageNo = storyData.fetch.lastPageNo || 0;
	storyData.fetch.fetchedPages = storyData.fetch.fetchedPages || 0;
	storyData.fetch.failedPages = storyData.fetch.failedPages || [];
	storyData.fetch.lastFetch = storyData.fetch.lastFetch || startedAt.toISOString();
	storyData.fetch.startTime = storyData.fetch.startTime || startedAt.toISOString();
	storyData.fetch.endTime = storyData.fetch.endTime || "";
	storyData.fetch.durationMs = storyData.fetch.durationMs || 0;
	storyData.fetch.durationText = storyData.fetch.durationText || "";

	storyData.stats.totalPosts = storyData.stats.totalPosts || 0;
	storyData.stats.totalWords = storyData.stats.totalWords || 0;
	storyData.stats.totalCharacters = storyData.stats.totalCharacters || 0;
	storyData.stats.totalImages = storyData.stats.totalImages || 0;
	storyData.stats.imageDownloads = storyData.stats.imageDownloads || 0;
	storyData.stats.averagePostsPerPage = storyData.stats.averagePostsPerPage || 0;
	storyData.stats.averageWordsPerPost = storyData.stats.averageWordsPerPost || 0;

	storyData.posts.eng = storyData.posts.eng || {};
	storyData.posts.hin = storyData.posts.hin || {};
}

function finalizeStoryDataFile(jsonFilePath, url, author, startedAt, options = {}) {
	if (!fs.existsSync(jsonFilePath)) return null;

	const completedAt = new Date();
	const storyData = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

	ensureStoryDataMeta(storyData, url, author, startedAt);

	storyData.meta.status = options.interrupted || storyData.errors.hasError ? "partial" : "completed";

	storyData.fetch.lastFetch = completedAt.toISOString();
	storyData.fetch.endTime = completedAt.toISOString();
	storyData.fetch.durationMs = completedAt - startedAt;
	storyData.fetch.durationText = formatDuration(storyData.fetch.durationMs);

	storyData.stats.totalPosts = Object.keys(storyData.posts.eng).length;
	storyData.stats.totalWords = countWordsInPosts(storyData.posts.eng);
	storyData.stats.totalCharacters = countCharactersInPosts(storyData.posts.eng);
	storyData.stats.totalImages = countImagesInPosts(storyData.posts.eng);

	storyData.stats.averagePostsPerPage = storyData.fetch.fetchedPages
		? Number((storyData.stats.totalPosts / storyData.fetch.fetchedPages).toFixed(2))
		: 0;

	storyData.stats.averageWordsPerPost = storyData.stats.totalPosts
		? Number((storyData.stats.totalWords / storyData.stats.totalPosts).toFixed(2))
		: 0;

	writeStoryDataFile(jsonFilePath, storyData);
	return storyData;
}
//===========helper funciotn for finalizeStoryDataFile start ========
function stripHtml(html) {
	return String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function countWordsInHtml(html) {
	const text = stripHtml(html);
	return text ? text.split(/\s+/).length : 0;
}

function countCharactersInHtml(html) {
	return stripHtml(html).length;
}

function countWordsInPosts(posts) {
	return Object.values(posts || {}).reduce((total, html) => {
		return total + countWordsInHtml(html);
	}, 0);
}

function countCharactersInPosts(posts) {
	return Object.values(posts || {}).reduce((total, html) => {
		return total + countCharactersInHtml(html);
	}, 0);
}
//===========helper funciotn for finalizeStoryDataFile end ========

function writeStoryDataFile(jsonFilePath, storyData) {
	fs.writeFileSync(jsonFilePath, JSON.stringify(storyData, null, 2), "utf8");
}

function createStorySummary(storyData) {
	if (!storyData || typeof storyData !== "object") return null;

	return {
		url: storyData.meta.url,
		domain: storyData.meta.domain,
		threadId: storyData.meta.threadId,
		storyName: storyData.meta.storyName,
		writerName: storyData.meta.writerName,
		status: storyData.meta.status,

		totalPage: storyData.fetch.totalPage,
		lastPageNo: storyData.fetch.lastPageNo,
		fetchedPages: storyData.fetch.fetchedPages,
		lastFetch: storyData.fetch.lastFetch,

		totalPosts: storyData.stats.totalPosts,
		totalWords: storyData.stats.totalWords,
		totalCharacters: storyData.stats.totalCharacters,
		totalImages: storyData.stats.totalImages,
		imageDownloads: storyData.stats.imageDownloads,
	};
}

function formatDuration(milliseconds) {
	const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean).join(" ");
}

function parsePositiveInteger(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function clampInteger(value, fallback, min, max) {
	const parsed = Number.parseInt(value, 10);
	const numeric = Number.isInteger(parsed) ? parsed : fallback;
	return Math.max(min, Math.min(max, numeric));
}

function getClientErrorMessage(err) {
	const messages = {
		AUTHOR_MISSING: "Author name missing",
		AUTHOR_NOT_FOUND: "Author not found in selected pages",
		DOMAIN_NOT_SUPPORTED: "Domain not supported yet. Saved in backend domain hit list.",
		FETCH_CANCELLED: "Fetch cancelled",
		NO_STORY_POSTS: "No story posts found for this author",
		SITE_UNREACHABLE: "Site unreachable or page could not be loaded",
		URL_INVALID: "Invalid URL",
		URL_MISSING: "URL missing",
	};

	return messages[err.code] || err.message || "Scraping failed";
}
