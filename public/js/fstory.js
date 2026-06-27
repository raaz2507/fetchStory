export class FetchStoryPackage {
	static FORMAT = "fetchstory";
	static FORMAT_VERSION = 2;
	static IMAGE_INDEX_VERSION = 1;
	static IMAGE_INDEX_FILE = "image-index.json";

	normalizePath(value) {
		return String(value || "")
			.replace(/\\/g, "/")
			.replace(/^\.\/+/, "")
			.replace(/\/+/g, "/");
	}

	assertSafeRelativePath(value, label) {
		const normalized = this.normalizePath(value);
		if (
			!normalized ||
			normalized.startsWith("/") ||
			/^[a-z]+:/i.test(normalized) ||
			normalized.split("/").includes("..")
		) {
			throw new Error(`${label} contains an unsafe path`);
		}
		return normalized;
	}

	cloneStory(storyData) {
		return JSON.parse(JSON.stringify(storyData || {}));
	}

	sanitizeFileName(value, fallback = "story") {
		const clean = String(value || "")
			.trim()
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
			.replace(/\s+/g, "_")
			.replace(/_+/g, "_")
			.replace(/^[_\.]+|[_\.]+$/g, "")
			.slice(0, 100);
		return clean || fallback;
	}

	getStoryInfo(storyData) {
		const meta = storyData && storyData.meta ? storyData.meta : {};
		const title = meta.storyName || storyData.storyName || storyData.title || "Story";
		const author = meta.writerName || storyData["writer-name"] || storyData.writerName || storyData.author || "";
		const sourceUrl = meta.url || storyData.url || "";
		let sourceDomain = meta.domain || "";
		if (!sourceDomain && sourceUrl) {
			try {
				sourceDomain = new URL(sourceUrl).hostname;
			} catch (_) {
				sourceDomain = "";
			}
		}
		return { title, author, sourceUrl, sourceDomain };
	}

	normalizeStoryLanguages(storyData) {
		const story = this.cloneStory(storyData);
		const posts = story.posts || {};
		story.posts = {
			...posts,
			eng: posts.eng || {},
			hin: {
				...(posts.hindi || {}),
				...(posts.hin || {}),
			},
		};
		delete story.posts.hindi;
		return story;
	}

	createImageIndex() {
		return {
			version: FetchStoryPackage.IMAGE_INDEX_VERSION,
			algorithm: "sha256",
			images: {},
			urlMap: {},
			hashMap: {},
			updatedAt: new Date().toISOString(),
		};
	}

	normalizeImageIndex(value) {
		if (
			!value ||
			Number(value.version) !== FetchStoryPackage.IMAGE_INDEX_VERSION ||
			value.algorithm !== "sha256" ||
			!value.images ||
			!value.urlMap ||
			!value.hashMap
		) {
			throw new Error("Valid image-index.json is required");
		}
		return this.cloneStory(value);
	}

	addImageUrl(imageIndex, entry, value) {
		const url = this.getHttpUrl(value);
		if (!url) return;
		if (!entry.originalUrls.includes(url)) entry.originalUrls.push(url);
		imageIndex.urlMap[url] = entry.id;
	}

	getHttpUrl(value) {
		if (!value) return "";
		try {
			const parsed = new URL(value);
			return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
		} catch (_) {
			return "";
		}
	}

	replaceImagePaths(storyData, replacer) {
		const story = this.normalizeStoryLanguages(storyData);
		for (const language of ["eng", "hin"]) {
			for (const key of Object.keys(story.posts[language] || {})) {
				const html = String(story.posts[language][key] || "");
				story.posts[language][key] = html.replace(
					/\b(src|data-original-src)=(["'])(.*?)\2/gi,
					(match, attribute, quote, value) => {
						const replacement = replacer(value);
						return `${attribute}=${quote}${replacement || value}${quote}`;
					},
				);
			}
		}
		return story;
	}

	async open(file, options = {}) {
		if (!window.JSZip) throw new Error("ZIP support is not available");
		const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
		let lastProgressSignature = "";
		const report = (progress) => {
			if (!onProgress) return;
			const payload = {
				stagePercent: 0,
				current: 0,
				total: 0,
				...progress,
			};
			payload.overallPercent = Math.round(Number(payload.overallPercent) || 0);
			payload.stagePercent = Math.round(Number(payload.stagePercent) || 0);
			const signature = [
				payload.stage,
				payload.overallPercent,
				payload.stagePercent,
				payload.current,
				payload.total,
				payload.detail,
			].join("|");
			if (signature === lastProgressSignature) return;
			lastProgressSignature = signature;
			onProgress(payload);
		};

		report({
			stage: "opening",
			label: "Opening package",
			detail: this.formatFileSize(file.size),
			overallPercent: 2,
		});
		const zip = await window.JSZip.loadAsync(file);
		report({
			stage: "manifest",
			label: "Reading manifest",
			detail: "Checking package format",
			overallPercent: 8,
		});
		const manifestEntry = zip.file("manifest.json");
		if (!manifestEntry) throw new Error("manifest.json is missing");

		const manifestText = await manifestEntry.async("string", (metadata) => {
			report({
				stage: "manifest",
				label: "Reading manifest",
				detail: `${Math.round(metadata.percent || 0)}%`,
				overallPercent: 8 + Math.round((metadata.percent || 0) * 0.04),
				stagePercent: metadata.percent || 0,
			});
		});
		const manifest = JSON.parse(manifestText);
		if (manifest.format !== FetchStoryPackage.FORMAT) throw new Error("This is not a FetchStory package");
		if (Number(manifest.formatVersion) !== FetchStoryPackage.FORMAT_VERSION) {
			throw new Error(`Unsupported FetchStory format version: ${manifest.formatVersion}`);
		}

		const contentFile = this.assertSafeRelativePath(manifest.contentFile, "contentFile");
		const imageIndexFile = this.assertSafeRelativePath(manifest.imageIndexFile, "imageIndexFile");
		const imagesFolder = this.assertSafeRelativePath(manifest.imagesFolder || "images/", "imagesFolder")
			.replace(/\/?$/, "/");
		const storyEntry = zip.file(contentFile);
		if (!storyEntry) throw new Error(`Story file is missing: ${contentFile}`);
		const imageIndexEntry = zip.file(imageIndexFile);
		if (!imageIndexEntry) throw new Error(`Image index is missing: ${imageIndexFile}`);

		report({
			stage: "story",
			label: "Loading story JSON",
			detail: contentFile,
			overallPercent: 12,
		});
		const rawStoryText = await storyEntry.async("string", (metadata) => {
			report({
				stage: "story",
				label: "Loading story JSON",
				detail: `${Math.round(metadata.percent || 0)}% · ${contentFile}`,
				overallPercent: 12 + Math.round((metadata.percent || 0) * 0.18),
				stagePercent: metadata.percent || 0,
			});
		});
		const rawStoryData = this.normalizeStoryLanguages(JSON.parse(rawStoryText));
		report({
			stage: "integrity",
			label: "Verifying integrity",
			detail: "Checking story and image index",
			overallPercent: 31,
		});
		if (!manifest.integrity?.storyChecksum || await this.sha256(rawStoryText) !== manifest.integrity.storyChecksum) {
			throw new Error("Story checksum does not match manifest");
		}
		const imageIndexText = await imageIndexEntry.async("string");
		if (!manifest.integrity?.imageIndexChecksum || await this.sha256(imageIndexText) !== manifest.integrity.imageIndexChecksum) {
			throw new Error("Image index checksum does not match manifest");
		}
		const imageIndex = this.normalizeImageIndex(JSON.parse(imageIndexText));
		const images = new Map();
		const objectUrls = new Map();
		const pathByObjectUrl = new Map();
		const availablePaths = [...new Set(
			Object.values(imageIndex.images)
				.filter((entry) => entry.status === "available" && entry.path)
				.map((entry) => this.assertSafeRelativePath(entry.path, "image path")),
		)];
		const imageEntries = availablePaths.map((entryPath) => {
			const entry = zip.file(entryPath);
			if (!entry) throw new Error(`Indexed image is missing: ${entryPath}`);
			return [entryPath, entry];
		});
		const totalImages = imageEntries.length;

		for (let index = 0; index < imageEntries.length; index++) {
			const [entryPath, entry] = imageEntries[index];
			const normalized = this.normalizePath(entryPath);
			const imageNumber = index + 1;
			const fileName = normalized.split("/").pop() || normalized;
			const bytes = await entry.async("uint8array", (metadata) => {
				const completedPortion = index + ((metadata.percent || 0) / 100);
				const imagePercent = totalImages ? (completedPortion / totalImages) * 100 : 100;
				report({
					stage: "images",
					label: "Extracting images",
					detail: fileName,
					overallPercent: 35 + Math.round(imagePercent * 0.5),
					stagePercent: imagePercent,
					current: imageNumber,
					total: totalImages,
					fileName,
				});
			});
			const blob = new Blob([bytes]);
			images.set(normalized, bytes);
			const objectUrl = URL.createObjectURL(blob);
			objectUrls.set(normalized, objectUrl);
			pathByObjectUrl.set(objectUrl, normalized);
		}

		report({
			stage: "preparing",
			label: "Preparing story",
			detail: totalImages ? `${totalImages} images ready` : "No packaged images",
			overallPercent: 90,
			stagePercent: 100,
			current: totalImages,
			total: totalImages,
		});
		const context = {
			manifest,
			contentFile,
			imageIndexFile,
			imagesFolder,
			imageIndex,
			images,
			objectUrls,
			pathByObjectUrl,
			sourceName: file.name,
		};

		const result = {
			manifest,
			rawStoryData,
			storyData: this.materialize(rawStoryData, context),
			context,
		};
		report({
			stage: "ready",
			label: "Package ready",
			detail: `${contentFile} loaded`,
			overallPercent: 94,
			stagePercent: 100,
			current: totalImages,
			total: totalImages,
		});
		return result;
	}

	formatFileSize(bytes) {
		const size = Number(bytes) || 0;
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
		return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	materialize(storyData, context) {
		if (!context) return this.normalizeStoryLanguages(storyData);
		return this.replaceImagePaths(storyData, (value) => {
			const normalized = this.normalizePath(value);
			const direct = context.objectUrls.get(normalized);
			if (direct) return direct;

			const fileName = normalized.split("/").pop();
			if (!fileName) return value;
			const packagePath = `${context.imagesFolder}${fileName}`;
			return context.objectUrls.get(packagePath) || value;
		});
	}

	createContextFromStoredPackage(packageData) {
		const meta = packageData && packageData.meta ? packageData.meta : {};
		const images = new Map();
		const objectUrls = new Map();
		const pathByObjectUrl = new Map();
		const imagesFolder = this.assertSafeRelativePath(meta.imagesFolder || "images/", "imagesFolder")
			.replace(/\/?$/, "/");

		for (const [rawPath, rawBytes] of packageData?.images || []) {
			const normalized = this.normalizePath(rawPath);
			const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes || []);
			images.set(normalized, bytes);
			const blob = new Blob([bytes]);
			const objectUrl = URL.createObjectURL(blob);
			objectUrls.set(normalized, objectUrl);
			pathByObjectUrl.set(objectUrl, normalized);
		}

		return {
			manifest: meta.manifest || null,
			contentFile: meta.contentFile || "story.json",
			imageIndexFile: meta.imageIndexFile || FetchStoryPackage.IMAGE_INDEX_FILE,
			imagesFolder,
			imageIndex: this.normalizeImageIndex(meta.imageIndex || this.createImageIndex()),
			images,
			objectUrls,
			pathByObjectUrl,
			sourceName: meta.sourceName || "cached-story.fstory",
		};
	}

	async sha256(text) {
		const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
		const hash = await crypto.subtle.digest("SHA-256", bytes);
		return Array.from(new Uint8Array(hash))
			.map((value) => value.toString(16).padStart(2, "0"))
			.join("");
	}

	getExtension(source, contentType) {
		const fromPath = String(source || "").match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
		if (fromPath) return fromPath[1].toLowerCase();
		const type = String(contentType || "").split(";")[0];
		const byType = {
			"image/jpeg": "jpg",
			"image/png": "png",
			"image/gif": "gif",
			"image/webp": "webp",
			"image/svg+xml": "svg",
			"image/avif": "avif",
		};
		return byType[type] || "bin";
	}

	async createImageCollector(context, imagesFolder) {
		const images = new Map(context && context.images ? context.images : []);
		const assignedPaths = new Map();
		const imageIndex = context?.imageIndex
			? this.normalizeImageIndex(context.imageIndex)
			: this.createImageIndex();

		const collect = async (source, originalSource = "") => {
			if (!source || source.startsWith("data:")) return source;
			if (context && context.pathByObjectUrl && context.pathByObjectUrl.has(source)) {
				const packagePath = context.pathByObjectUrl.get(source);
				const indexedId = Object.keys(imageIndex.images).find((id) => imageIndex.images[id].path === packagePath);
				if (indexedId) this.addImageUrl(imageIndex, imageIndex.images[indexedId], originalSource);
				return packagePath;
			}

			const normalized = this.normalizePath(source);
			if (images.has(normalized)) {
				const indexedId = Object.keys(imageIndex.images).find((id) => imageIndex.images[id].path === normalized);
				if (indexedId) this.addImageUrl(imageIndex, imageIndex.images[indexedId], originalSource);
				return normalized;
			}
			if (assignedPaths.has(source)) return assignedPaths.get(source);

			try {
				const response = await fetch(source, { credentials: "same-origin" });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const contentType = response.headers.get("Content-Type") || "";
				const bytes = new Uint8Array(await response.arrayBuffer());
				const sha256 = await this.sha256(bytes);
				const duplicateId = imageIndex.hashMap[sha256];
				if (duplicateId && imageIndex.images[duplicateId]) {
					const duplicate = imageIndex.images[duplicateId];
					this.addImageUrl(imageIndex, duplicate, originalSource || source);
					assignedPaths.set(source, duplicate.path);
					return duplicate.path;
				}
				const extension = this.getExtension(source, contentType);
				const packagePath = `${imagesFolder}${sha256.slice(0, 24)}.${extension}`;
				const id = `img_${sha256.slice(0, 24)}`;
				images.set(packagePath, bytes);
				assignedPaths.set(source, packagePath);
				const entry = {
					id,
					status: "available",
					path: packagePath,
					sha256,
					size: bytes.length,
					originalUrls: [],
					downloadedAt: new Date().toISOString(),
					lastCheckedAt: new Date().toISOString(),
					error: null,
				};
				this.addImageUrl(imageIndex, entry, originalSource || source);
				imageIndex.images[id] = entry;
				imageIndex.hashMap[sha256] = id;
				return packagePath;
			} catch (error) {
				console.warn(`Image kept as external URL: ${source}`, error.message);
				const url = this.getHttpUrl(originalSource) || this.getHttpUrl(source);
				if (url && !imageIndex.urlMap[url]) {
					const id = `url_${(await this.sha256(url)).slice(0, 24)}`;
					imageIndex.images[id] = {
						id,
						status: "failed",
						path: null,
						sha256: null,
						size: null,
						originalUrls: [url],
						downloadedAt: null,
						lastCheckedAt: new Date().toISOString(),
						error: error.message,
					};
					imageIndex.urlMap[url] = id;
				}
				return source;
			}
		};
		collect.images = images;
		collect.imageIndex = imageIndex;
		return collect;
	}

	async build(storyData, context = null, options = {}) {
		if (!window.JSZip) throw new Error("ZIP support is not available");
		const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
		let lastProgressSignature = "";
		const report = (progress) => {
			if (!onProgress) return;
			const payload = {
				stagePercent: 0,
				current: 0,
				total: 0,
				...progress,
			};
			payload.overallPercent = Math.round(Number(payload.overallPercent) || 0);
			payload.stagePercent = Math.round(Number(payload.stagePercent) || 0);
			const signature = [
				payload.stage,
				payload.overallPercent,
				payload.stagePercent,
				payload.current,
				payload.total,
				payload.detail,
			].join("|");
			if (signature === lastProgressSignature) return;
			lastProgressSignature = signature;
			onProgress(payload);
		};
		const info = this.getStoryInfo(storyData);
		const previousManifest = context && context.manifest ? context.manifest : {};
		if (context && Number(previousManifest.formatVersion) !== FetchStoryPackage.FORMAT_VERSION) {
			throw new Error("Only FetchStory v2 packages are supported");
		}
		report({
			stage: "preparing",
			label: "Preparing package",
			detail: info.title,
			overallPercent: 5,
		});
		const contentFile = this.assertSafeRelativePath(
			previousManifest.contentFile || `${this.sanitizeFileName(info.title)}.json`,
			"contentFile",
		);
		const imagesFolder = this.assertSafeRelativePath(
			previousManifest.imagesFolder || "images/",
			"imagesFolder",
		).replace(/\/?$/, "/");
		const collector = await this.createImageCollector(context, imagesFolder);
		const imageMap = collector.images;

		const story = this.normalizeStoryLanguages(storyData);
		const languageKeys = ["eng", "hin"].flatMap((language) => {
			return Object.keys(story.posts[language] || {}).map((key) => [language, key]);
		});
		let processedPosts = 0;
		for (const language of ["eng", "hin"]) {
			for (const key of Object.keys(story.posts[language] || {})) {
				const template = document.createElement("template");
				template.innerHTML = String(story.posts[language][key] || "");
				for (const image of template.content.querySelectorAll("img")) {
					const source = image.getAttribute("src");
					const originalSource = image.getAttribute("data-original-src") || source;
					if (source) {
						const packagePath = await collector(source, originalSource);
						image.setAttribute("src", packagePath);
						const originalUrl = this.getHttpUrl(originalSource);
						if (originalUrl) image.setAttribute("data-original-src", originalUrl);
					}
				}
				story.posts[language][key] = template.innerHTML;
				processedPosts++;
				report({
					stage: "posts",
					label: "Preparing posts",
					detail: `${language} ${key}`,
					overallPercent: 10 + Math.round((processedPosts / Math.max(languageKeys.length, 1)) * 35),
					stagePercent: (processedPosts / Math.max(languageKeys.length, 1)) * 100,
					current: processedPosts,
					total: languageKeys.length,
				});
			}
		}

		report({
			stage: "manifest",
			label: "Writing manifest",
			detail: "Checksums and image index",
			overallPercent: 50,
		});
		const storyText = JSON.stringify(story, null, 2);
		const engCount = Object.keys(story.posts.eng || {}).length;
		const hinCount = Object.keys(story.posts.hin || {}).length;
		const now = new Date().toISOString();
		const imageIndex = collector.imageIndex;
		imageIndex.updatedAt = now;
		const imageIndexFile = FetchStoryPackage.IMAGE_INDEX_FILE;
		const imageIndexText = JSON.stringify(imageIndex, null, 2);
		const manifest = {
			format: FetchStoryPackage.FORMAT,
			formatVersion: FetchStoryPackage.FORMAT_VERSION,
			storyId: previousManifest.storyId || crypto.randomUUID(),
			title: info.title,
			author: info.author,
			sourceUrl: info.sourceUrl,
			sourceDomain: info.sourceDomain,
			contentFile,
			imagesFolder,
			imageIndexFile,
			languages: hinCount ? ["eng", "hin"] : ["eng"],
			defaultLanguage: previousManifest.defaultLanguage || "eng",
			translation: {
				status: hinCount === 0 ? "none" : hinCount >= engCount ? "complete" : "partial",
				translatedPosts: hinCount,
				engineVersion: String(story.translation?.dictionaryVersion || previousManifest.translation?.engineVersion || "1"),
				updatedAt: hinCount ? now : null,
			},
			createdAt: previousManifest.createdAt || now,
			updatedAt: now,
			integrity: {
				storyChecksum: await this.sha256(storyText),
				imageIndexChecksum: await this.sha256(imageIndexText),
			},
		};

		const zip = new window.JSZip();
		report({
			stage: "zip",
			label: "Adding files",
			detail: `${imageMap.size} images`,
			overallPercent: 62,
			current: 0,
			total: imageMap.size,
		});
		zip.file("manifest.json", JSON.stringify(manifest, null, 2));
		zip.file(contentFile, storyText);
		zip.file(imageIndexFile, imageIndexText);
		let addedImages = 0;
		for (const [path, blob] of imageMap) {
			zip.file(path, blob);
			addedImages++;
			report({
				stage: "zip",
				label: "Adding images",
				detail: path.split("/").pop() || path,
				overallPercent: 62 + Math.round((addedImages / Math.max(imageMap.size, 1)) * 13),
				stagePercent: (addedImages / Math.max(imageMap.size, 1)) * 100,
				current: addedImages,
				total: imageMap.size,
			});
		}
		const blob = await zip.generateAsync({
			type: "blob",
			compression: "DEFLATE",
			compressionOptions: { level: 6 },
		}, (metadata) => {
			report({
				stage: "compressing",
				label: "Compressing package",
				detail: `${Math.round(metadata.percent || 0)}%`,
				overallPercent: 75 + Math.round((metadata.percent || 0) * 0.23),
				stagePercent: metadata.percent || 0,
			});
		});
		report({
			stage: "ready",
			label: "Package ready",
			detail: this.formatFileSize(blob.size),
			overallPercent: 100,
		});

		return {
			blob,
			fileName: `${this.sanitizeFileName(info.title)}.fstory`,
			manifest,
			imageIndex,
		};
	}

	download(blob, fileName) {
		const safeFileName = String(fileName || "story").toLowerCase().endsWith(".fstory")
			? String(fileName)
			: `${String(fileName || "story").replace(/\.+$/, "")}.fstory`;
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = safeFileName;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	dispose(context) {
		if (!context || !context.objectUrls) return;
		for (const url of context.objectUrls.values()) URL.revokeObjectURL(url);
		context.objectUrls.clear();
		context.pathByObjectUrl.clear();
		context.images.clear();
		context.imageIndex = null;
	}

}

const fetchStoryPackage = new FetchStoryPackage();

export default fetchStoryPackage;
