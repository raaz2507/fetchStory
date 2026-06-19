let storyData = null;
let pageKeys = [];
let keyIndex = 0;
let isLoading = false;
let currentLang = "eng";
let currentFontSize = 1.1; // Default em size
const readerCacheDbName = "storyReaderDB";
const readerCacheStoreName = "cache";
const readerStoryCacheId = "lastStory";

const contentArea = document.getElementById("content-area");
const statusDiv = document.getElementById("reader-status");
const titleElement = document.getElementById("story-main-title");
const langToggleBtn = document.getElementById("lang-toggle-btn");
const fileNameDisplay = document.getElementById("file-name-display");
const loadAllBtn = document.getElementById("load-all-btn");
const sideBar = document.getElementById("side-control-bar");
const toggleText = document.getElementById("toggle-text");
const translateBtn = document.getElementById("translateBtn");
const stopTranslateBtn = document.getElementById("stopTranslateBtn");
const translateStatus = document.getElementById("status");
const translateProgressBar = document.getElementById("progressBar");
const translatedDownloadBtn = document.getElementById("downloadBtn");
const notFoundDownloadBtn = document.getElementById("downloadNotFoundBtn");
const imageFolderPathInput = document.getElementById("imageFolderPath");
const setImageFolderBtn = document.getElementById("setImageFolderBtn");
const imageFolderStatus = document.getElementById("image-folder-status");
const clearCacheBtn = document.getElementById("clear-cache-btn");
const readProgress = document.getElementById("read-progress");
const readerTabBtn = document.getElementById("reader-tab-btn");
const translatorTabBtn = document.getElementById("translator-tab-btn");
const readerTabPanel = document.getElementById("reader-tab-panel");
const translatorTabPanel = document.getElementById("translator-tab-panel");
const totalWordsInput = document.getElementById("total_words");
const notFoundWordsInput = document.getElementById("not_found_words");
const conversionPercentInput = document.getElementById("con_per");
const logoutBtn = document.getElementById("logoutBtn");
const fstoryFileInput = document.getElementById("fstoryFile");
const downloadFstoryBtn = document.getElementById("downloadFstoryBtn");
const fstoryStatus = document.getElementById("fstory-status");
let useLocalImageFolder = false;
let activeTranslationJobId = null;
let activeTranslationSource = null;
let lastScrollSaveAt = 0;
let isRestoringScroll = false;
let currentFstoryContext = null;

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
	const options = {
		...init,
		credentials: init.credentials || "same-origin",
	};
	const response = await nativeFetch(input, options);
	if (response.status === 401) {
		window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
	}
	return response;
};

// 🔄 साइडबार को टॉगल (ओपन/क्लोज) करने का फंक्शन
if (contentArea) {
	function switchSidebarTab(tabName) {
		const isTranslator = tabName === "translator";

		if (readerTabBtn) readerTabBtn.classList.toggle("active", !isTranslator);
		if (translatorTabBtn) translatorTabBtn.classList.toggle("active", isTranslator);
		if (readerTabPanel) readerTabPanel.classList.toggle("active", !isTranslator);
		if (translatorTabPanel) translatorTabPanel.classList.toggle("active", isTranslator);
	}
	window.switchSidebarTab = switchSidebarTab;

	function toggleSidebar(event) {
		if (event) event.stopPropagation();
		sideBar.classList.toggle("open");
		if (sideBar.classList.contains("open")) {
			toggleText.textContent = "Close";
		} else {
			toggleText.textContent = "Menu";
		}
	}

	// 🔍 फॉन्ट साइज एडजस्टमेंट फंक्शन
	function adjustFontSize(action) {
		currentFontSize += action;
		// सेफ्टी लिमिट ताकि टेक्स्ट बहुत छोटा या अजीब बड़ा न हो जाए
		if (currentFontSize < 0.8) currentFontSize = 0.8;
		if (currentFontSize > 2.0) currentFontSize = 2.0;
		contentArea.style.fontSize = currentFontSize + "em";
	}

	// 🎨 कस्टम बैकग्राउंड कलर हैंडलर
	function setCustomBg(color) {
		// अगर कस्टम कलर चुना गया है तो पहले एक्टिव थीम हटा दें
		document.documentElement.removeAttribute("data-theme");
		document.documentElement.style.setProperty("--bg-color", color);

		// डार्क कलर डिटेक्ट करके ऑटोमैटिक टेक्स्ट कलर एडजस्ट करने का बेसिक लॉजिक
		// (ताकि बैकग्राउंड ब्लैक करने पर टेक्स्ट गायब न हो जाए)
		const r = parseInt(color.substr(1, 2), 16);
		const g = parseInt(color.substr(3, 2), 16);
		const b = parseInt(color.substr(5, 2), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;

		if (brightness < 128) {
			document.documentElement.style.setProperty("--text-color", "#ffffff");
			document.documentElement.style.setProperty("--container-bg", "#1e1e1e");
			document.documentElement.style.setProperty("--title-color", "#ffffff");
		} else {
			document.documentElement.style.setProperty("--text-color", "#333333");
			document.documentElement.style.setProperty("--container-bg", "#ffffff");
			document.documentElement.style.setProperty("--title-color", "#111111");
		}
	}

	// थीम सेलेक्टर चेंज हैंडलर
	function changeTheme(themeName) {
		// कस्टम स्टाइल रीसेट करें अगर कोई था
		document.documentElement.style.removeProperty("--bg-color");
		document.documentElement.style.removeProperty("--text-color");
		document.documentElement.style.removeProperty("--container-bg");
		document.documentElement.style.removeProperty("--title-color");

		if (themeName === "light") {
			document.documentElement.removeAttribute("data-theme");
		} else {
			document.documentElement.setAttribute("data-theme", themeName);
		}
	}

	function handleFileSelect(event) {
		const file = event.target.files[0];
		if (!file) return;

		FetchStoryPackage.dispose(currentFstoryContext);
		currentFstoryContext = null;
		if (fstoryStatus) fstoryStatus.textContent = "";
		fileNameDisplay.textContent = file.name;
		statusDiv.textContent = "Reading selected file...";

		const reader = new FileReader();
		reader.onload = function (e) {
			try {
				const parsedData = JSON.parse(e.target.result);
				initStoryRender(parsedData);
			} catch (err) {
				console.error(err);
				statusDiv.textContent = "Error: Invalid JSON File structure.";
			}
		};
		reader.readAsText(file);
	}

	if (translateBtn) {
		translateBtn.addEventListener("click", translateCurrentStory);
	}

	if (stopTranslateBtn) {
		stopTranslateBtn.addEventListener("click", stopCurrentTranslation);
	}

	if (setImageFolderBtn) {
		setImageFolderBtn.addEventListener("click", setImageFolderPath);
	}

	if (clearCacheBtn) {
		clearCacheBtn.addEventListener("click", clearReaderCache);
	}

	if (logoutBtn) {
		logoutBtn.addEventListener("click", logoutPublicSession);
	}

	if (fstoryFileInput) {
		fstoryFileInput.addEventListener("change", async () => {
			const file = fstoryFileInput.files && fstoryFileInput.files[0];
			if (!file) return;

			try {
				if (fstoryStatus) fstoryStatus.textContent = "Opening package...";
				const opened = await FetchStoryPackage.open(file);
				FetchStoryPackage.dispose(currentFstoryContext);
				currentFstoryContext = opened.context;
				fileNameDisplay.textContent = `${file.name} (${opened.manifest.contentFile})`;
				initStoryRender(opened.rawStoryData, { saveToCache: false });
				if (fstoryStatus) fstoryStatus.textContent = "Package loaded locally";
			} catch (err) {
				console.error(err);
				if (fstoryStatus) fstoryStatus.textContent = err.message || "Invalid .fstory";
				statusDiv.textContent = "Error: Could not open FetchStory package.";
			} finally {
				fstoryFileInput.value = "";
			}
		});
	}

	if (downloadFstoryBtn) {
		downloadFstoryBtn.addEventListener("click", async () => {
			if (!storyData) {
				if (fstoryStatus) fstoryStatus.textContent = "Load a story first";
				return;
			}

			try {
				downloadFstoryBtn.disabled = true;
				if (fstoryStatus) fstoryStatus.textContent = "Building updated package...";
				const result = await FetchStoryPackage.build(storyData, currentFstoryContext);
				FetchStoryPackage.download(result.blob, result.fileName);
				if (fstoryStatus) fstoryStatus.textContent = `${result.fileName} downloaded`;
			} catch (err) {
				console.error(err);
				if (fstoryStatus) fstoryStatus.textContent = err.message || "Package download failed";
			} finally {
				downloadFstoryBtn.disabled = false;
			}
		});
	}

	const savedImageFolderPath = localStorage.getItem("readerImageFolderPath") || "";
	if (imageFolderPathInput && savedImageFolderPath) {
		imageFolderPathInput.value = savedImageFolderPath;
		setImageFolderPath();
	}

	async function setImageFolderPath() {
		const folderPath = imageFolderPathInput ? imageFolderPathInput.value.trim() : "";

		try {
			const response = await fetch("/api/reader/image-folder", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ path: folderPath }),
			});
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || "Image path not set");
			}

			useLocalImageFolder = Boolean(folderPath);
			localStorage.setItem("readerImageFolderPath", result.path || folderPath);
			imageFolderStatus.textContent = result.path ? `Image path set: ${result.path}` : "Image path cleared";

			if (storyData) {
				initStoryRender(storyData);
			}
		} catch (err) {
			console.error(err);
			imageFolderStatus.textContent = err.message || "Image path not set";
		}
	}

	async function translateCurrentStory() {
		if (!storyData) {
			translateStatus.textContent = "Please load a JSON file first.";
			return;
		}

		translateBtn.disabled = true;
		if (stopTranslateBtn) stopTranslateBtn.classList.remove("hide");
		translateProgressBar.value = 0;
		translatedDownloadBtn.classList.add("hide");
		notFoundDownloadBtn.classList.add("hide");
		const checksum = getStoryChecksum(storyData);
		updateTranslatorStats({
			totalWords: checksum.words,
			notFoundWords: 0,
			conversionPercent: 0,
		});
		translateStatus.textContent = `Checksum ready: ${checksum.pages} posts / ${checksum.chars} chars. Starting translation...`;

		try {
			const response = await fetch("/api/translator/translate-json", {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ storyData, checksum }),
			});
			const result = await response.json().catch(() => ({}));

			if (!response.ok || !result.success) {
				throw new Error(result.error || "Translation failed");
			}

			activeTranslationJobId = result.jobId;
			watchTranslationProgress(result.jobId);
		} catch (err) {
			console.error(err);
			const message = err && err.message && err.message !== "Failed to fetch" ? err.message : "Translator API not reachable. Restart server and try again.";
			translateStatus.textContent = message;
			translateBtn.disabled = false;
			if (stopTranslateBtn) stopTranslateBtn.classList.add("hide");
		}
	}

	async function stopCurrentTranslation() {
		if (!activeTranslationJobId) return;

		if (stopTranslateBtn) stopTranslateBtn.disabled = true;
		translateStatus.textContent = "Stopping translation...";

		try {
			const response = await fetch(`/api/translator/translate-json/${activeTranslationJobId}/cancel`, {
				method: "POST",
				credentials: "same-origin",
			});
			const result = await response.json().catch(() => ({}));

			if (!response.ok || !result.success) {
				throw new Error(result.error || "Stop translation failed");
			}

			translateStatus.textContent = "Stop requested. Finishing current post...";
		} catch (err) {
			console.error(err);
			translateStatus.textContent = err.message || "Stop translation failed.";
			if (stopTranslateBtn) stopTranslateBtn.disabled = false;
		}
	}

	function getStoryChecksum(data) {
		const engPosts = data && data.posts && data.posts.eng ? data.posts.eng : {};
		const keys = Object.keys(engPosts).sort((a, b) => Number(a) - Number(b));

		return {
			pages: keys.length,
			chars: keys.reduce((sum, page) => {
				return sum + String(engPosts[page] || "").length;
			}, 0),
			words: keys.reduce((sum, page) => {
				return sum + countWordsFromHtml(engPosts[page] || "");
			}, 0),
		};
	}

	function countWordsFromHtml(html) {
		const text = String(html)
			.replace(/<[^>]*>/g, " ")
			.replace(/&nbsp;/g, " ")
			.trim();

		return text ? text.split(/\s+/).length : 0;
	}

	function updateTranslatorStats(stats = {}) {
		if (totalWordsInput && stats.totalWords !== undefined && stats.totalWords !== null) {
			totalWordsInput.value = stats.totalWords;
		}

		if (notFoundWordsInput && stats.notFoundWords !== undefined && stats.notFoundWords !== null) {
			notFoundWordsInput.value = stats.notFoundWords;
		}

		if (conversionPercentInput && stats.conversionPercent !== undefined && stats.conversionPercent !== null) {
			conversionPercentInput.value = stats.conversionPercent;
		}
	}

	function watchTranslationProgress(jobId) {
		const source = new EventSource(`/api/translator/progress/${jobId}`, {
			withCredentials: true,
		});
		activeTranslationSource = source;

		source.onmessage = (event) => {
			const progress = JSON.parse(event.data);
			const total = progress.total || 0;
			const current = progress.current || 0;
			const processPercent = total ? Math.floor((current / total) * 100) : 0;
			const conversionPercent = progress.conversionPercent !== undefined && progress.conversionPercent !== null ? progress.conversionPercent : processPercent;
			const checksumText = progress.checksum ? ` (${progress.checksum.pages} posts / ${progress.checksum.chars} chars)` : "";
			const pageText = progress.currentPage ? ` - post ${progress.currentPage}` : "";
			const messageText = progress.message ? `${progress.message}. ` : "";
			const totalWords = progress.totalWords ?? (progress.checksum && progress.checksum.words) ?? 0;
			const translatedWords = progress.translatedWords ?? 0;

			translateProgressBar.value = processPercent;
			updateTranslatorStats({
				totalWords,
				notFoundWords: progress.notFoundWords ?? progress.notFoundCount ?? progress.not_found_words,
				conversionPercent,
			});
			translateStatus.textContent = progress.error ? progress.error : `${messageText}Posts ${current}/${total} (${processPercent}%). Words ${translatedWords}/${totalWords} (${conversionPercent}%)${pageText}${checksumText}`;

			if (progress.done) {
				source.close();
				activeTranslationSource = null;
				activeTranslationJobId = null;
				translateBtn.disabled = false;
				if (stopTranslateBtn) {
					stopTranslateBtn.disabled = false;
					stopTranslateBtn.classList.add("hide");
				}

				if (progress.error) return;

				if (progress.cancelled) {
					translateStatus.textContent = `Translation stopped. Posts ${current}/${total}. Words ${translatedWords}/${totalWords} (${conversionPercent}%).`;
					return;
				}

				translateProgressBar.value = 100;
				translateStatus.textContent = `Translation complete. Words ${translatedWords}/${totalWords} (${conversionPercent}%).`;

				if (progress.translatedFile) {
					translatedDownloadBtn.href = progress.translatedFile;
					translatedDownloadBtn.download = "translated_story.json";
					translatedDownloadBtn.classList.remove("hide");
					replaceLoadedStoryWithTranslated(progress.translatedFile);
				}

				if (progress.notFoundFile) {
					notFoundDownloadBtn.href = progress.notFoundFile;
					notFoundDownloadBtn.download = "not_found_words.json";
					notFoundDownloadBtn.classList.remove("hide");
					updateNotFoundWordCount(progress.notFoundFile);
				}
			}
		};

		source.onerror = () => {
			source.close();
			activeTranslationSource = null;
			activeTranslationJobId = null;
			translateBtn.disabled = false;
			if (stopTranslateBtn) {
				stopTranslateBtn.disabled = false;
				stopTranslateBtn.classList.add("hide");
			}
			translateStatus.textContent = "Translation progress connection failed.";
		};
	}

	async function updateNotFoundWordCount(notFoundFileUrl) {
		try {
			const response = await fetch(notFoundFileUrl);
			if (!response.ok) return;

			const notFoundWords = await response.json();
			updateTranslatorStats({
				notFoundWords: Object.keys(notFoundWords || {}).length,
			});
		} catch (err) {
			console.warn("Not found words count load failed:", err.message);
		}
	}

	async function replaceLoadedStoryWithTranslated(translatedFileUrl) {
		try {
			translateStatus.textContent = "Translation complete. Loading translated JSON...";
			const response = await fetch(translatedFileUrl);
			if (!response.ok) {
				throw new Error("Translated JSON load failed");
			}

			const translatedStory = await response.json();
			fileNameDisplay.textContent = "translated_story.json (Loaded)";
			initStoryRender(translatedStory);
			translateStatus.textContent = "Translation complete. Loaded translated JSON.";
		} catch (err) {
			console.error(err);
			translateStatus.textContent = err.message || "Translation complete, but translated JSON load failed.";
		}
	}

	function openReaderCacheDb() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(readerCacheDbName, 1);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(readerCacheStoreName)) {
					db.createObjectStore(readerCacheStoreName, { keyPath: "id" });
				}
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async function saveReaderStoryCache(data) {
		const db = await openReaderCacheDb();

		return new Promise((resolve, reject) => {
			const tx = db.transaction(readerCacheStoreName, "readwrite");
			tx.objectStore(readerCacheStoreName).put({
				id: readerStoryCacheId,
				storyData: data,
				savedAt: new Date().toISOString(),
			});
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => {
				db.close();
				reject(tx.error);
			};
		});
	}

	async function loadReaderStoryCache() {
		const db = await openReaderCacheDb();

		return new Promise((resolve, reject) => {
			const tx = db.transaction(readerCacheStoreName, "readonly");
			const request = tx.objectStore(readerCacheStoreName).get(readerStoryCacheId);

			request.onsuccess = () => {
				resolve(request.result ? request.result.storyData : null);
			};
			request.onerror = () => reject(request.error);
			tx.oncomplete = () => db.close();
			tx.onerror = () => {
				db.close();
				reject(tx.error);
			};
		});
	}

	async function clearReaderCache() {
		const confirmed = window.confirm("Clear cached story and saved reading positions?");
		if (!confirmed) return;

		if (clearCacheBtn) clearCacheBtn.disabled = true;
		statusDiv.textContent = "Clearing cache...";

		try {
			const db = await openReaderCacheDb();
			await new Promise((resolve, reject) => {
				const tx = db.transaction(readerCacheStoreName, "readwrite");
				tx.objectStore(readerCacheStoreName).delete(readerStoryCacheId);
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onerror = () => {
					db.close();
					reject(tx.error);
				};
			});

			for (let i = localStorage.length - 1; i >= 0; i--) {
				const key = localStorage.key(i);
				if (key && key.startsWith("readerScroll:")) {
					localStorage.removeItem(key);
				}
			}

			fileNameDisplay.textContent = storyData ? "Cache cleared" : "No file chosen";
			statusDiv.textContent = "Cache cleared. Reload will not auto-load this story.";
			updateReadProgress();
		} catch (err) {
			console.error(err);
			statusDiv.textContent = err.message || "Cache clear failed.";
		} finally {
			if (clearCacheBtn) clearCacheBtn.disabled = false;
		}
	}

	async function logoutPublicSession() {
		if (logoutBtn) logoutBtn.disabled = true;

		try {
			await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "same-origin",
			});
		} catch (err) {
			console.warn("Logout request failed:", err.message);
		} finally {
			window.location.href = "/login.html";
		}
	}

	async function loadStoryJson() {
		try {
			const cachedStory = await loadReaderStoryCache();
			if (cachedStory) {
				fileNameDisplay.textContent = "Cached story JSON (Auto-loaded)";
				initStoryRender(cachedStory, { saveToCache: false });
				return;
			}
		} catch (err) {
			console.warn("Reader cache load failed:", err.message);
		}

		try {
			const response = await fetch("./story_data.json");
			if (!response.ok) throw new Error("Local file not found");
			const data = await response.json();
			fileNameDisplay.textContent = "story_data.json (Auto-loaded)";
			initStoryRender(data);
		} catch (err) {
			console.log("No local story_data.json found automatically. Ready for manual browse.");
			statusDiv.textContent = "Please browse and select your story_data.json file to start reading.";
		}
	}

	function initStoryRender(data, options = {}) {
		contentArea.innerHTML = "";
		const normalizedStory = FetchStoryPackage.normalizeStoryLanguages(data);
		storyData = currentFstoryContext
			? FetchStoryPackage.materialize(normalizedStory, currentFstoryContext)
			: normalizedStory;
		keyIndex = 0;
		isLoading = false;
		statusDiv.textContent = "";

		if (loadAllBtn) loadAllBtn.style.display = "inline-block";

		const storyName = storyData?.meta?.storyName || "Story";

		titleElement.textContent = storyName;
		document.title = storyName + " - Offline Reader";

		if (storyData && storyData.posts && storyData.posts.eng) {
			pageKeys = Object.keys(storyData.posts.eng).sort((a, b) => Number(a) - Number(b));
		}

		if (options.saveToCache !== false) {
			saveReaderStoryCache(storyData).catch((err) => {
				console.warn("Reader cache save failed:", err.message);
			});
		}

		loadNextPage();
		restoreReaderScrollSoon();
	}

	function getReaderScrollKey() {
		if (!storyData) return "";

		const posts = storyData.posts && storyData.posts.eng ? storyData.posts.eng : {};
		const identity = [storyData.meta?.url || "", storyData.meta?.storyName || "", storyData.meta?.writerName || "", Object.keys(posts).length].join("|");

		return `readerScroll:${identity}`;
	}

	function getLoadedPostPercent() {
		if (!pageKeys.length) return 0;

		return Math.min(100, Math.round((Math.min(keyIndex, pageKeys.length) / pageKeys.length) * 100));
	}

	function updateReadProgress() {
		if (!readProgress) return;
		readProgress.textContent = pageKeys.length ? `Loaded: ${Math.min(keyIndex, pageKeys.length)}/${pageKeys.length} posts (${getLoadedPostPercent()}%)` : "Loaded: 0/0 posts (0%)";
	}

	function saveReaderScroll(force = false) {
		if (!storyData || isRestoringScroll) return;

		const now = Date.now();
		if (!force && now - lastScrollSaveAt < 3000) return;

		const key = getReaderScrollKey();
		if (!key) return;

		lastScrollSaveAt = now;
		localStorage.setItem(
			key,
			JSON.stringify({
				y: Math.max(0, window.scrollY || document.documentElement.scrollTop || 0),
				percent: getLoadedPostPercent(),
				updatedAt: new Date().toISOString(),
			}),
		);
	}

	async function restoreReaderScrollSoon() {
		const key = getReaderScrollKey();
		if (!key) return;

		let saved = null;
		try {
			saved = JSON.parse(localStorage.getItem(key) || "null");
		} catch (err) {
			saved = null;
		}

		if (!saved || !Number.isFinite(Number(saved.y)) || Number(saved.y) <= 0) {
			updateReadProgress();
			return;
		}

		isRestoringScroll = true;
		const targetY = Number(saved.y);

		for (let attempt = 0; attempt < 30; attempt++) {
			const scrollableHeight = document.documentElement.scrollHeight;
			if (scrollableHeight >= targetY + window.innerHeight || keyIndex >= pageKeys.length) {
				break;
			}
			isLoading = false;
			loadNextPage();
			await new Promise((resolve) => setTimeout(resolve, 80));
		}

		setTimeout(() => {
			window.scrollTo({ top: targetY, behavior: "auto" });
			updateReadProgress();
			isRestoringScroll = false;
		}, 120);
	}

	function normalizeStoryImages(container) {
	if (!container) return;

	const images = container.getElementsByTagName("img");

	for (const img of images) {
		const currentSrc = img.getAttribute("src");
		if (!currentSrc) continue;

		const fileName = getImageFileName(currentSrc);
		const objectUrl = imageFileMap.get(fileName);

		if (objectUrl) {
			img.setAttribute("src", objectUrl);
		}
	}
}

	function getImageFileName(src) {
		const cleanSrc = String(src).split("?")[0].split("#")[0];
		const parts = cleanSrc.replace(/\\/g, "/").split("/");
		return parts[parts.length - 1] || "";
	}

	function loadNextPage() {
		if (isLoading || !storyData || pageKeys.length === 0) return;

		if (keyIndex >= pageKeys.length) {
			statusDiv.textContent = "— End of Story —";
			if (loadAllBtn) loadAllBtn.style.display = "none";
			return;
		}

		isLoading = true;
		const actualPageNum = pageKeys[keyIndex];
		statusDiv.textContent = "Checking Content Part " + actualPageNum + "...";

		const currentPosts = storyData.posts?.[currentLang] || {};
		let pageHtml = currentPosts[actualPageNum] || "";

		const isHtmlEmpty = !pageHtml || pageHtml.replace(/<[^>]*>/g, "").trim() === "";

		if (!isHtmlEmpty) {
			const pageDiv = document.createElement("div");
			pageDiv.className = "story-page";
			pageDiv.setAttribute("data-page-num", actualPageNum);

			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = pageHtml;

			normalizeStoryImages(tempDiv);

			pageDiv.innerHTML = tempDiv.innerHTML;
			contentArea.appendChild(pageDiv);

			keyIndex++;
			updateReadProgress();
			statusDiv.textContent = "";
			isLoading = false;

			setTimeout(() => {
				const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight);
				if (docHeight <= window.innerHeight && keyIndex < pageKeys.length) {
					loadNextPage();
				}
			}, 100);
		} else {
			const pageDiv = document.createElement("div");
			pageDiv.className = "story-page";
			pageDiv.setAttribute("data-page-num", actualPageNum);
			pageDiv.innerHTML = `<p style="color: #999; font-style: italic; text-align: center;">[Part ${actualPageNum} Content Not Available in ${currentLang === "eng" ? "English" : "Hindi"}]</p>`;
			contentArea.appendChild(pageDiv);

			keyIndex++;
			updateReadProgress();
			isLoading = false;

			setTimeout(() => {
				loadNextPage();
			}, 50);
		}
	}

	function loadWholeStory() {
		if (!storyData || pageKeys.length === 0) return;
		statusDiv.textContent = "Loading all parts together...";
		while (keyIndex < pageKeys.length) {
			isLoading = false;
			loadNextPage();
		}
		if (loadAllBtn) loadAllBtn.style.display = "none";
	}

	function handlePrint() {
		if (keyIndex < pageKeys.length) {
			const confirmPrint = confirm("पूरी कहानी अभी लोड नहीं हुई है। क्या आप प्रिंट करने से पहले सभी पार्ट्स लोड करना चाहते हैं?");
			if (confirmPrint) {
				loadWholeStory();
				setTimeout(() => {
					window.print();
				}, 500);
			} else {
				window.print();
			}
		} else {
			window.print();
		}
	}

	function toggleLanguage() {
		if (!storyData) return;

		if (currentLang === "eng") {
			currentLang = "hin";
			langToggleBtn.textContent = "🌐 Switch to English";
			langToggleBtn.style.background = "#28a745";
		} else {
			currentLang = "eng";
			langToggleBtn.textContent = "🌐 Switch to Hindi";
			langToggleBtn.style.background = "#007bff";
		}

		const loadedPages = contentArea.getElementsByClassName("story-page");

		for (let i = 0; i < loadedPages.length; i++) {
			const pNum = loadedPages[i].getAttribute("data-page-num");
			const currentPosts = storyData.posts?.[currentLang] || {};
			let newHtml = currentPosts[pNum] || "";
			const isHtmlEmpty = !newHtml || newHtml.replace(/<[^>]*>/g, "").trim() === "";

			if (!isHtmlEmpty) {
				const tempDiv = document.createElement("div");
				tempDiv.innerHTML = newHtml;
				normalizeStoryImages(tempDiv);
				loadedPages[i].innerHTML = tempDiv.innerHTML;
			} else {
				loadedPages[i].innerHTML = `<p style="color: #999; font-style: italic; text-align: center;">[Part ${pNum} Content Not Available in ${currentLang === "eng" ? "English" : "Hindi"}]</p>`;
			}
		}
	}

	window.addEventListener("scroll", () => {
		updateReadProgress();
		saveReaderScroll();

		const totalHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
		const currentScroll = window.innerHeight + (window.scrollY || document.documentElement.scrollTop);
		if (currentScroll >= totalHeight - 800) {
			loadNextPage();
		}
	});

	window.addEventListener("beforeunload", () => {
		saveReaderScroll(true);
	});

	// बाहर कहीं क्लिक करने पर साइडबार अपने आप बंद हो जाए
	document.addEventListener("click", (e) => {
		if (!sideBar.contains(e.target) && !e.target.closest(".sidebar-toggle-btn")) {
			sideBar.classList.remove("open");
			toggleText.textContent = "Menu";
		}
	});

	loadStoryJson();
}

const imageFileMap = new Map();

document.getElementById("imageFolderPicker").addEventListener("change", handleImageFolderSelect);

function handleImageFolderSelect(event) {
	imageFileMap.clear();

	const files = Array.from(event.target.files || []);

	for (const file of files) {
		const fileName = file.name;
		const objectUrl = URL.createObjectURL(file);

		imageFileMap.set(fileName, objectUrl);
	}

	document.getElementById("image-folder-status").textContent =
		`${files.length} images loaded`;

	// Already rendered images ko refresh karo
	normalizeStoryImages(document.getElementById("content-area"));

	// Browser ko DOM update ka chance do
	setTimeout(() => {
		normalizeStoryImages(document.getElementById("content-area"));
	}, 100);
}
//====================
function getStoryName() {
	return storyData?.meta?.storyName || "Story";
}

function getWriterName() {
	return storyData?.meta?.writerName || "";
}

function getStoryUrl() {
	return storyData?.meta?.url || "";
}

function getTotalPage() {
	return Number(storyData?.fetch?.totalPage || 0);
}

function getPosts(lang = currentLang) {
	return storyData?.posts?.[lang] || {};
}

//=====================
