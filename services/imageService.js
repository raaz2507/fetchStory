const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const globalImageCache = createImageCache();

function createImageCache() {
	return {
		savedHashes: new Map(),
		savedUrls: new Map(),
		inFlightUrls: new Map(),
	};
}

function resetImageCache() {
	globalImageCache.savedHashes.clear();
	globalImageCache.savedUrls.clear();
	globalImageCache.inFlightUrls.clear();
}

async function downloadImageWithHash(imgUrl, baseFolder, imageIndex, totalImages, baseURL, signal, progressCallback, imageCache) {
	const cache = imageCache || globalImageCache;
	let finalUrl;
	try {
		finalUrl = new URL(imgUrl, baseURL).href;
	} catch (err) {
		return null;
	}

	if (cache.savedUrls.has(finalUrl)) {
		console.log(`\nDuplicate image URL skipped: ${finalUrl}`);
		return {
			localPath: cache.savedUrls.get(finalUrl),
			wasDuplicate: true,
			wasDownloaded: false,
		};
	}

	if (cache.inFlightUrls.has(finalUrl)) {
		console.log(`\nWaiting for duplicate in-flight image: ${finalUrl}`);
		const result = await cache.inFlightUrls.get(finalUrl);
		return result && result.localPath ? { localPath: result.localPath, wasDuplicate: true, wasDownloaded: false } : result;
	}

	const downloadPromise = downloadUniqueImage(finalUrl, baseFolder, imageIndex, totalImages, signal, progressCallback, cache);
	cache.inFlightUrls.set(finalUrl, downloadPromise);

	try {
		const localPath = await downloadPromise;
		if (localPath && localPath.localPath) cache.savedUrls.set(finalUrl, localPath.localPath);
		return localPath;
	} finally {
		cache.inFlightUrls.delete(finalUrl);
	}
}

async function downloadUniqueImage(finalUrl, baseFolder, imageIndex, totalImages, signal, progressCallback, cache) {
	console.log(`\nImage [${imageIndex}/${totalImages}] starting: ${finalUrl}`);

	const imagesFolder = path.join(baseFolder, "images");
	if (!fs.existsSync(imagesFolder)) {
		fs.mkdirSync(imagesFolder, { recursive: true });
	}

	const response = await axios({
		url: finalUrl,
		responseType: "stream",
		signal,
		timeout: 30000,
	});

	const totalLength = Number(response.headers["content-length"] || 0);
	const tempFilePath = path.join(imagesFolder, `download-${Date.now()}-${crypto.randomUUID()}-${imageIndex}.tmp`);
	const writer = fs.createWriteStream(tempFilePath);
	const hash = crypto.createHash("sha256");
	let downloadedLength = 0;
	let lastProgressPercent = -1;

	if (totalLength) {
		console.log(`Image size: ${Math.round(totalLength / 1024)} KB`);
	}

	response.data.on("data", (chunk) => {
		downloadedLength += chunk.length;
		hash.update(chunk);

		const imagePercent = totalLength ? Math.floor((downloadedLength / totalLength) * 100) : 0;
		if (totalLength) {
			safeStdoutWrite(`Image ${imageIndex}: ${imagePercent}%\r`);
		}

		if (progressCallback && shouldReportProgress(imagePercent, lastProgressPercent, downloadedLength, totalLength)) {
			lastProgressPercent = imagePercent;
			progressCallback({
				imageIndex,
				totalImages,
				imagePercent,
				downloadedBytes: downloadedLength,
				totalBytes: totalLength,
				imageUrl: finalUrl,
			});
		}
	});

	await new Promise((resolve, reject) => {
		let abort;
		const cleanup = () => {
			if (signal && abort) signal.removeEventListener("abort", abort);
		};
		abort = () => {
			response.data.destroy();
			writer.destroy();
			cleanup();
			reject(createScrapeError("FETCH_CANCELLED", "Fetch cancelled"));
		};

		writer.on("finish", () => {
			cleanup();
			resolve();
		});
		writer.on("error", (err) => {
			cleanup();
			reject(err);
		});
		response.data.on("error", (err) => {
			cleanup();
			reject(err);
		});

		if (signal) {
			if (signal.aborted) {
				abort();
				return;
			}
			signal.addEventListener("abort", abort, { once: true });
		}

		response.data.pipe(writer);
	});

	const digest = hash.digest("hex").slice(0, 10);

	if (cache.savedHashes.has(digest)) {
		await removeFileWithRetry(tempFilePath);
		console.log("\nDuplicate image skipped");
		const duplicatePath = cache.savedHashes.get(digest);
		cache.savedUrls.set(finalUrl, duplicatePath);
		return {
			localPath: duplicatePath,
			wasDuplicate: true,
			wasDownloaded: false,
		};
	}

	const ext = path.extname(new URL(finalUrl).pathname) || ".jpg";
	const fileName = `${digest}${ext}`;
	const filePath = path.join(imagesFolder, fileName);

	await renameFileWithRetry(tempFilePath, filePath);

	const relativePath = `images/${fileName}`;
	cache.savedHashes.set(digest, relativePath);
	cache.savedUrls.set(finalUrl, relativePath);

	console.log(`\nSaved image as ${fileName}`);

	return {
		localPath: relativePath,
		wasDuplicate: false,
		wasDownloaded: true,
	};
}

function shouldReportProgress(currentPercent, lastPercent, downloadedLength, totalLength) {
	if (!totalLength) return downloadedLength === 0;
	return currentPercent === 100 || currentPercent >= lastPercent + 5;
}

async function renameFileWithRetry(sourcePath, targetPath) {
	const retryableCodes = new Set(["EBUSY", "EPERM", "EACCES"]);

	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			await fs.promises.rename(sourcePath, targetPath);
			return;
		} catch (err) {
			if (!retryableCodes.has(err.code) || attempt === 5) {
				throw err;
			}

			await delay(150 * attempt);
		}
	}
}

async function removeFileWithRetry(filePath) {
	const retryableCodes = new Set(["EBUSY", "EPERM", "EACCES"]);

	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			await fs.promises.rm(filePath, { force: true });
			return;
		} catch (err) {
			if (!retryableCodes.has(err.code) || attempt === 5) {
				throw err;
			}

			await delay(150 * attempt);
		}
	}
}

function safeStdoutWrite(message) {
	try {
		process.stdout.write(message);
	} catch (err) {
		console.log(message.trim());
	}
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createScrapeError(code, message) {
	const err = new Error(message);
	err.code = code;
	return err;
}

module.exports = { createImageCache, downloadImageWithHash, resetImageCache };
