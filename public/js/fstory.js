(function initFetchStoryPackage(global) {
	"use strict";

	const FORMAT = "fetchstory";
	const FORMAT_VERSION = 1;

	function normalizePath(value) {
		return String(value || "")
			.replace(/\\/g, "/")
			.replace(/^\.\/+/, "")
			.replace(/\/+/g, "/");
	}

	function assertSafeRelativePath(value, label) {
		const normalized = normalizePath(value);
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

	function cloneStory(storyData) {
		return JSON.parse(JSON.stringify(storyData || {}));
	}

	function sanitizeFileName(value, fallback = "story") {
		const clean = String(value || "")
			.trim()
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
			.replace(/\s+/g, "_")
			.replace(/_+/g, "_")
			.replace(/^[_\.]+|[_\.]+$/g, "")
			.slice(0, 100);
		return clean || fallback;
	}

	function getStoryInfo(storyData) {
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

	function normalizeStoryLanguages(storyData) {
		const story = cloneStory(storyData);
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

	function replaceImagePaths(storyData, replacer) {
		const story = normalizeStoryLanguages(storyData);
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

	async function open(file) {
		if (!global.JSZip) throw new Error("ZIP support is not available");
		const zip = await global.JSZip.loadAsync(file);
		const manifestEntry = zip.file("manifest.json");
		if (!manifestEntry) throw new Error("manifest.json is missing");

		const manifest = JSON.parse(await manifestEntry.async("string"));
		if (manifest.format !== FORMAT) throw new Error("This is not a FetchStory package");
		if (Number(manifest.formatVersion) !== FORMAT_VERSION) {
			throw new Error(`Unsupported FetchStory format version: ${manifest.formatVersion}`);
		}

		const contentFile = assertSafeRelativePath(manifest.contentFile, "contentFile");
		const imagesFolder = assertSafeRelativePath(manifest.imagesFolder || "images/", "imagesFolder")
			.replace(/\/?$/, "/");
		const storyEntry = zip.file(contentFile);
		if (!storyEntry) throw new Error(`Story file is missing: ${contentFile}`);

		const rawStoryText = await storyEntry.async("string");
		const rawStoryData = normalizeStoryLanguages(JSON.parse(rawStoryText));
		if (manifest.integrity && manifest.integrity.storyChecksum) {
			const checksum = await sha256(rawStoryText);
			if (checksum !== manifest.integrity.storyChecksum) {
				throw new Error("Story checksum does not match manifest");
			}
		}
		const images = new Map();
		const objectUrls = new Map();
		const pathByObjectUrl = new Map();

		for (const [entryPath, entry] of Object.entries(zip.files)) {
			const normalized = normalizePath(entryPath);
			if (entry.dir || !normalized.startsWith(imagesFolder)) continue;
			const bytes = await entry.async("uint8array");
			const blob = new Blob([bytes]);
			images.set(normalized, bytes);
			const objectUrl = URL.createObjectURL(blob);
			objectUrls.set(normalized, objectUrl);
			pathByObjectUrl.set(objectUrl, normalized);
		}

		const context = {
			manifest,
			contentFile,
			imagesFolder,
			images,
			objectUrls,
			pathByObjectUrl,
			sourceName: file.name,
		};

		return {
			manifest,
			rawStoryData,
			storyData: materialize(rawStoryData, context),
			context,
		};
	}

	function materialize(storyData, context) {
		if (!context) return normalizeStoryLanguages(storyData);
		return replaceImagePaths(storyData, (value) => {
			const normalized = normalizePath(value);
			const direct = context.objectUrls.get(normalized);
			if (direct) return direct;

			const fileName = normalized.split("/").pop();
			if (!fileName) return value;
			const packagePath = `${context.imagesFolder}${fileName}`;
			return context.objectUrls.get(packagePath) || value;
		});
	}

	async function sha256(text) {
		const bytes = new TextEncoder().encode(text);
		const hash = await crypto.subtle.digest("SHA-256", bytes);
		return Array.from(new Uint8Array(hash))
			.map((value) => value.toString(16).padStart(2, "0"))
			.join("");
	}

	function getExtension(source, contentType) {
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

	async function createImageCollector(context, imagesFolder) {
		const images = new Map(context && context.images ? context.images : []);
		const assignedPaths = new Map();
		let imageCounter = images.size;

		const collect = async function collect(source) {
			if (!source || source.startsWith("data:")) return source;
			if (context && context.pathByObjectUrl && context.pathByObjectUrl.has(source)) {
				return context.pathByObjectUrl.get(source);
			}

			const normalized = normalizePath(source);
			if (images.has(normalized)) return normalized;
			if (assignedPaths.has(source)) return assignedPaths.get(source);

			try {
				const response = await fetch(source, { credentials: "same-origin" });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const contentType = response.headers.get("Content-Type") || "";
				const bytes = new Uint8Array(await response.arrayBuffer());
				const originalName = normalized.split("/").pop() || "";
				const baseName = sanitizeFileName(originalName.replace(/\.[^.]+$/, ""), "image");
				const extension = getExtension(source, contentType);
				let packagePath;
				do {
					imageCounter += 1;
					packagePath = `${imagesFolder}${String(imageCounter).padStart(4, "0")}_${baseName}.${extension}`;
				} while (images.has(packagePath));
				images.set(packagePath, bytes);
				assignedPaths.set(source, packagePath);
				return packagePath;
			} catch (error) {
				console.warn(`Image kept as external URL: ${source}`, error.message);
				return source;
			}
		};
		collect.images = images;
		return collect;
	}

	async function build(storyData, context = null) {
		if (!global.JSZip) throw new Error("ZIP support is not available");
		const info = getStoryInfo(storyData);
		const previousManifest = context && context.manifest ? context.manifest : {};
		const contentFile = assertSafeRelativePath(
			previousManifest.contentFile || `${sanitizeFileName(info.title)}.json`,
			"contentFile",
		);
		const imagesFolder = assertSafeRelativePath(
			previousManifest.imagesFolder || "images/",
			"imagesFolder",
		).replace(/\/?$/, "/");
		const collector = await createImageCollector(context, imagesFolder);
		const imageMap = collector.images;

		const story = normalizeStoryLanguages(storyData);
		for (const language of ["eng", "hin"]) {
			for (const key of Object.keys(story.posts[language] || {})) {
				const template = document.createElement("template");
				template.innerHTML = String(story.posts[language][key] || "");
				for (const image of template.content.querySelectorAll("img")) {
					const source = image.getAttribute("src");
					if (source) image.setAttribute("src", await collector(source));
				}
				story.posts[language][key] = template.innerHTML;
			}
		}

		const storyText = JSON.stringify(story, null, 2);
		const engCount = Object.keys(story.posts.eng || {}).length;
		const hinCount = Object.keys(story.posts.hin || {}).length;
		const now = new Date().toISOString();
		const manifest = {
			format: FORMAT,
			formatVersion: FORMAT_VERSION,
			storyId: previousManifest.storyId || crypto.randomUUID(),
			title: info.title,
			author: info.author,
			sourceUrl: info.sourceUrl,
			sourceDomain: info.sourceDomain,
			contentFile,
			imagesFolder,
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
				storyChecksum: await sha256(storyText),
			},
		};

		const zip = new global.JSZip();
		zip.file("manifest.json", JSON.stringify(manifest, null, 2));
		zip.file(contentFile, storyText);
		for (const [path, blob] of imageMap) {
			zip.file(path, blob);
		}
		const blob = await zip.generateAsync({
			type: "blob",
			compression: "DEFLATE",
			compressionOptions: { level: 6 },
		});

		return {
			blob,
			fileName: `${sanitizeFileName(info.title)}.fstory`,
			manifest,
		};
	}

	function download(blob, fileName) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function dispose(context) {
		if (!context || !context.objectUrls) return;
		for (const url of context.objectUrls.values()) URL.revokeObjectURL(url);
		context.objectUrls.clear();
		context.pathByObjectUrl.clear();
		context.images.clear();
	}

	global.FetchStoryPackage = {
		open,
		build,
		download,
		dispose,
		materialize,
		normalizeStoryLanguages,
	};
})(window);
