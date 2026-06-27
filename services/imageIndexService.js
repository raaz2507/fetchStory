const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const IMAGE_INDEX_VERSION = 1;
const IMAGE_INDEX_FILE = "image-index.json";

function createImageIndex() {
	return {
		version: IMAGE_INDEX_VERSION,
		algorithm: "sha256",
		images: {},
		urlMap: {},
		hashMap: {},
		updatedAt: new Date().toISOString(),
	};
}

function normalizeImageIndex(value) {
	if (!value || Number(value.version) !== IMAGE_INDEX_VERSION || value.algorithm !== "sha256") {
		throw new Error("Valid image-index.json is required");
	}

	const normalized = {
		version: IMAGE_INDEX_VERSION,
		algorithm: "sha256",
		images: {},
		urlMap: {},
		hashMap: {},
		updatedAt: value.updatedAt || new Date().toISOString(),
	};
	const allowedStatuses = new Set(["pending", "available", "failed", "missing", "external"]);
	for (const [key, rawEntry] of Object.entries(value.images || {})) {
		if (!rawEntry || typeof rawEntry !== "object") continue;
		const id = String(rawEntry.id || key);
		const status = allowedStatuses.has(rawEntry.status) ? rawEntry.status : "pending";
		const packagePath = rawEntry.path ? normalizePackagePath(rawEntry.path) : null;
		if (rawEntry.path && !packagePath) {
			throw new Error(`Unsafe image path in image-index.json: ${rawEntry.path}`);
		}
		if (packagePath && !packagePath.startsWith("images/")) {
			throw new Error(`Unsafe image path in image-index.json: ${rawEntry.path}`);
		}
		const sha256 = /^[a-f0-9]{64}$/i.test(String(rawEntry.sha256 || ""))
			? String(rawEntry.sha256).toLowerCase()
			: null;
		if (status === "available" && (!packagePath || !sha256)) {
			throw new Error(`Available image entry is incomplete: ${id}`);
		}
		const entry = {
			id,
			status,
			path: packagePath,
			sha256,
			size: Number.isFinite(Number(rawEntry.size)) ? Number(rawEntry.size) : null,
			originalUrls: [],
			downloadedAt: rawEntry.downloadedAt || null,
			lastCheckedAt: rawEntry.lastCheckedAt || null,
			error: rawEntry.error ? String(rawEntry.error).slice(0, 500) : null,
		};
		for (const url of rawEntry.originalUrls || []) addUrl(entry, url);
		normalized.images[id] = entry;
		for (const url of entry.originalUrls) normalized.urlMap[url] = id;
		if (sha256) normalized.hashMap[sha256] = id;
	}
	return normalized;
}

function readImageIndex(filePath, required = false) {
	if (!fs.existsSync(filePath)) {
		if (required) throw new Error("image-index.json is missing");
		return createImageIndex();
	}
	return normalizeImageIndex(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function writeImageIndex(filePath, imageIndex) {
	const normalized = normalizeImageIndex(imageIndex);
	normalized.updatedAt = new Date().toISOString();
	fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
	return normalized;
}

function registerPendingUrl(imageIndex, url) {
	const normalizedUrl = getHttpUrl(url);
	if (!normalizedUrl) return null;
	const existingId = imageIndex.urlMap[normalizedUrl];
	if (existingId && imageIndex.images[existingId]) return imageIndex.images[existingId];

	const id = `url_${sha256Text(normalizedUrl).slice(0, 24)}`;
	const entry = imageIndex.images[id] || {
		id,
		status: "pending",
		path: null,
		sha256: null,
		size: null,
		originalUrls: [],
		downloadedAt: null,
		lastCheckedAt: null,
		error: null,
	};
	addUrl(entry, normalizedUrl);
	imageIndex.images[id] = entry;
	imageIndex.urlMap[normalizedUrl] = id;
	return entry;
}

function registerAvailableImage(imageIndex, details) {
	const sha256 = String(details.sha256 || "").toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Valid image SHA-256 missing");

	const existingId = imageIndex.hashMap[sha256];
	const id = existingId || `img_${sha256.slice(0, 24)}`;
	const previous = imageIndex.images[id] || {};
	const entry = {
		id,
		status: "available",
		path: normalizePackagePath(details.path || previous.path),
		sha256,
		size: Number(details.size ?? previous.size ?? 0),
		originalUrls: Array.isArray(previous.originalUrls) ? [...previous.originalUrls] : [],
		downloadedAt: details.downloadedAt || previous.downloadedAt || new Date().toISOString(),
		lastCheckedAt: new Date().toISOString(),
		error: null,
	};
	for (const url of details.originalUrls || []) addUrl(entry, url);
	if (details.originalUrl) addUrl(entry, details.originalUrl);

	imageIndex.images[id] = entry;
	imageIndex.hashMap[sha256] = id;
	for (const url of entry.originalUrls) imageIndex.urlMap[url] = id;
	return entry;
}

function markImageFailure(imageIndex, url, error) {
	const entry = registerPendingUrl(imageIndex, url);
	if (!entry) return null;
	entry.status = "failed";
	entry.lastCheckedAt = new Date().toISOString();
	entry.error = String(error || "Download failed").slice(0, 500);
	return entry;
}

function markMissingFiles(imageIndex, baseFolder) {
	for (const entry of Object.values(imageIndex.images)) {
		if (entry.status !== "available" || !entry.path) continue;
		const absolutePath = path.join(baseFolder, normalizePackagePath(entry.path));
		if (!fs.existsSync(absolutePath)) entry.status = "missing";
	}
	return imageIndex;
}

function buildImageIndexFromStory(storyData, baseFolder) {
	const imageIndex = createImageIndex();
	const imagesByPath = collectStoryImageReferences(storyData);

	for (const [localPath, urls] of imagesByPath.localPaths) {
		const normalizedPath = normalizePackagePath(localPath);
		const absolutePath = path.join(baseFolder, normalizedPath);
		if (!fs.existsSync(absolutePath)) {
			for (const url of urls) registerPendingUrl(imageIndex, url);
			continue;
		}
		const bytes = fs.readFileSync(absolutePath);
		registerAvailableImage(imageIndex, {
			path: normalizedPath,
			sha256: sha256Bytes(bytes),
			size: bytes.length,
			originalUrls: urls,
		});
	}
	for (const url of imagesByPath.remoteUrls) registerPendingUrl(imageIndex, url);
	return imageIndex;
}

function collectStoryImageReferences(storyData) {
	const localPaths = new Map();
	const remoteUrls = new Set();
	for (const section of ["eng", "hin"]) {
		for (const html of Object.values(storyData.posts?.[section] || {})) {
			const $ = cheerio.load(String(html || ""), { decodeEntities: false });
			$("img").each((_, image) => {
				const src = $(image).attr("src") || "";
				const originalUrl = getHttpUrl($(image).attr("data-original-src")) || getHttpUrl(src);
				if (isLocalImagePath(src)) {
					const localPath = normalizePackagePath(src);
					if (!localPaths.has(localPath)) localPaths.set(localPath, new Set());
					if (originalUrl) localPaths.get(localPath).add(originalUrl);
				} else if (originalUrl) {
					remoteUrls.add(originalUrl);
				}
			});
		}
	}
	return {
		localPaths: new Map([...localPaths].map(([key, urls]) => [key, [...urls]])),
		remoteUrls,
	};
}

function getIndexStats(imageIndex) {
	const stats = { total: 0, pending: 0, available: 0, failed: 0, missing: 0, external: 0 };
	for (const entry of Object.values(imageIndex.images || {})) {
		stats.total++;
		if (Object.hasOwn(stats, entry.status)) stats[entry.status]++;
	}
	return stats;
}

function addUrl(entry, value) {
	const url = getHttpUrl(value);
	if (url && !entry.originalUrls.includes(url)) entry.originalUrls.push(url);
}

function getHttpUrl(value) {
	if (!value) return "";
	try {
		const parsed = new URL(value);
		return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
	} catch {
		return "";
	}
}

function isLocalImagePath(value) {
	return /^(?:\.\/)?images\//i.test(String(value || ""));
}

function normalizePackagePath(value) {
	const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
	if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return "";
	return normalized;
}

function sha256Text(value) {
	return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sha256Bytes(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
	IMAGE_INDEX_FILE,
	IMAGE_INDEX_VERSION,
	buildImageIndexFromStory,
	createImageIndex,
	getHttpUrl,
	getIndexStats,
	markImageFailure,
	markMissingFiles,
	normalizeImageIndex,
	readImageIndex,
	registerAvailableImage,
	registerPendingUrl,
	sha256Bytes,
	writeImageIndex,
};
