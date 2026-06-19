import FetchStoryPackage from "./fstory.js?v=5";
import StoryCache from "./storyCache.js?v=2";

export class StoryReader {
    constructor() {
        // Constants
        // State Variables
        this.storyData = null;
        this.pageKeys = [];
        this.keyIndex = 0;
        this.isLoading = false;
        this.currentLang = "eng";
        this.currentFontSize = 1.1; // Default em size
        this.useLocalImageFolder = false;
        this.activeTranslationJobId = null;
        this.activeTranslationSource = null;
        this.lastScrollSaveAt = 0;
        this.isRestoringScroll = false;
        this.currentFstoryContext = null;
        this.imageFileMap = new Map();

        // DOM Elements Initialization
        this.initElements();

        // Agar content area window me maujood hai tabhi initialize karein
        if (this.contentArea) {
            this.initFetchOverride();
            this.initEvents();
            this.loadStoryJson();
        }
    }

    // Saare DOM elements ko select karne ka method
    initElements() {
        this.contentArea = document.getElementById("content-area");
        this.statusDiv = document.getElementById("reader-status");
        this.titleElement = document.getElementById("story-main-title");
        this.langToggleBtn = document.getElementById("lang-toggle-btn");
        this.printBtn = document.getElementById("print-btn");
        this.fileNameDisplay = document.getElementById("file-name-display");
        this.loadAllBtn = document.getElementById("load-all-btn");
        this.sideBar = document.getElementById("side-control-bar");
        this.sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
        this.toggleText = document.getElementById("toggle-text");
        this.jsonFileInput = document.getElementById("jsonFile");
        this.decreaseFontBtn = document.getElementById("decrease-font-btn");
        this.increaseFontBtn = document.getElementById("increase-font-btn");
        this.themeSelect = document.getElementById("theme-select");
        this.bgColorPicker = document.getElementById("bg-color-picker");
        this.translateBtn = document.getElementById("translateBtn");
        this.stopTranslateBtn = document.getElementById("stopTranslateBtn");
        this.translateStatus = document.getElementById("status");
        this.translateProgressBar = document.getElementById("progressBar");
        this.translatedDownloadBtn = document.getElementById("downloadBtn");
        this.notFoundDownloadBtn = document.getElementById("downloadNotFoundBtn");
        this.imageFolderStatus = document.getElementById("image-folder-status");
        this.clearCacheBtn = document.getElementById("clear-cache-btn");
        this.clearReadingProgressBtn = document.getElementById("clear-reading-progress-btn");
        this.readProgress = document.getElementById("read-progress");
        this.readerTabBtn = document.getElementById("reader-tab-btn");
        this.translatorTabBtn = document.getElementById("translator-tab-btn");
        this.readerTabPanel = document.getElementById("reader-tab-panel");
        this.translatorTabPanel = document.getElementById("translator-tab-panel");
        this.totalWordsInput = document.getElementById("total_words");
        this.notFoundWordsInput = document.getElementById("not_found_words");
        this.conversionPercentInput = document.getElementById("con_per");
        this.logoutBtn = document.getElementById("logoutBtn");
        this.fstoryFileInput = document.getElementById("fstoryFile");
        this.downloadFstoryBtn = document.getElementById("downloadFstoryBtn");
        this.clearFstoryBtn = document.getElementById("clearFstoryBtn");
        this.fstoryStatus = document.getElementById("fstory-status");
        this.imageFolderPicker = document.getElementById("imageFolderPicker");
    }

    // Custom Fetch override policy setup karna
    initFetchOverride() {
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
    }

    // Saare event listeners setup karne ka central logic
    initEvents() {
        if (this.sidebarToggleBtn) this.sidebarToggleBtn.addEventListener("click", (event) => this.toggleSidebar(event));
        if (this.jsonFileInput) this.jsonFileInput.addEventListener("change", (event) => this.handleFileSelect(event));
        if (this.readerTabBtn) this.readerTabBtn.addEventListener("click", () => this.switchSidebarTab("reader"));
        if (this.translatorTabBtn) this.translatorTabBtn.addEventListener("click", () => this.switchSidebarTab("translator"));
        if (this.loadAllBtn) this.loadAllBtn.addEventListener("click", () => this.loadWholeStory());
        if (this.decreaseFontBtn) this.decreaseFontBtn.addEventListener("click", () => this.adjustFontSize(-0.1));
        if (this.increaseFontBtn) this.increaseFontBtn.addEventListener("click", () => this.adjustFontSize(0.1));
        if (this.themeSelect) this.themeSelect.addEventListener("change", () => this.changeTheme(this.themeSelect.value));
        if (this.bgColorPicker) this.bgColorPicker.addEventListener("input", () => this.setCustomBg(this.bgColorPicker.value));
        if (this.langToggleBtn) this.langToggleBtn.addEventListener("click", () => this.toggleLanguage());
        if (this.printBtn) this.printBtn.addEventListener("click", () => this.handlePrint());
        if (this.translateBtn) this.translateBtn.addEventListener("click", () => this.translateCurrentStory());
        if (this.stopTranslateBtn) this.stopTranslateBtn.addEventListener("click", () => this.stopCurrentTranslation());
        if (this.clearCacheBtn) this.clearCacheBtn.addEventListener("click", () => this.clearReaderCache());
        if (this.clearReadingProgressBtn) this.clearReadingProgressBtn.addEventListener("click", () => this.clearReadingProgress());
        if (this.logoutBtn) this.logoutBtn.addEventListener("click", () => this.logoutPublicSession());
        if (this.clearFstoryBtn) this.clearFstoryBtn.addEventListener("click", () => this.clearLoadedPackage());

        if (this.fstoryFileInput) {
            this.fstoryFileInput.addEventListener("change", () => this.handleFstoryFileChange());
        }

        if (this.downloadFstoryBtn) {
            this.downloadFstoryBtn.addEventListener("click", () => this.handleFstoryDownload());
        }

        if (this.imageFolderPicker) {
            this.imageFolderPicker.addEventListener("change", (e) => this.handleImageFolderSelect(e));
        }

        // Window/Document scope global listeners
        window.addEventListener("scroll", () => this.handleWindowScroll());
        window.addEventListener("beforeunload", () => this.handleWindowBeforeUnload());
        document.addEventListener("click", (e) => this.handleDocumentOutsideClick(e));

    }

    // Sidebar management methods
    switchSidebarTab(tabName) {
        const isTranslator = tabName === "translator";
        if (this.readerTabBtn) this.readerTabBtn.classList.toggle("active", !isTranslator);
        if (this.translatorTabBtn) this.translatorTabBtn.classList.toggle("active", isTranslator);
        if (this.readerTabPanel) this.readerTabPanel.classList.toggle("active", !isTranslator);
        if (this.translatorTabPanel) this.translatorTabPanel.classList.toggle("active", isTranslator);
    }

    toggleSidebar(event) {
        if (event) event.stopPropagation();
        this.sideBar.classList.toggle("open");
        if (this.sideBar.classList.contains("open")) {
            this.toggleText.textContent = "Close";
        } else {
            this.toggleText.textContent = "Menu";
        }
    }

    // Font size modifiers
    adjustFontSize(action) {
        this.currentFontSize += action;
        if (this.currentFontSize < 0.8) this.currentFontSize = 0.8;
        if (this.currentFontSize > 2.0) this.currentFontSize = 2.0;
        this.contentArea.style.fontSize = this.currentFontSize + "em";
    }

    // Styling/Theme features
    setCustomBg(color) {
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.style.setProperty("--bg-color", color);

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

    changeTheme(themeName) {
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

    // File manipulation triggers
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        FetchStoryPackage.dispose(this.currentFstoryContext);
        this.currentFstoryContext = null;
        if (this.fstoryStatus) this.fstoryStatus.textContent = "";
        this.fileNameDisplay.textContent = file.name;
        this.statusDiv.textContent = "Reading selected file...";

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsedData = JSON.parse(e.target.result);
                this.initStoryRender(parsedData);
            } catch (err) {
                console.error(err);
                this.statusDiv.textContent = "Error: Invalid JSON File structure.";
            }
        };
        reader.readAsText(file);
    }

    async handleFstoryFileChange() {
        const file = this.fstoryFileInput.files && this.fstoryFileInput.files[0];
        if (!file) return;

        try {
            if (this.fstoryStatus) this.fstoryStatus.textContent = "Opening package...";
            const opened = await FetchStoryPackage.open(file);
            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = opened.context;
            this.fileNameDisplay.textContent = `${file.name} (${opened.manifest.contentFile})`;
            this.initStoryRender(opened.rawStoryData, { saveToCache: false });
            await StoryCache.save(opened.rawStoryData, { source: "fstory", appData: null });
            if (this.fstoryStatus) this.fstoryStatus.textContent = "Package loaded locally";
        } catch (err) {
            console.error(err);
            if (this.fstoryStatus) this.fstoryStatus.textContent = err.message || "Invalid .fstory";
            this.statusDiv.textContent = "Error: Could not open FetchStory package.";
        } finally {
            this.fstoryFileInput.value = "";
        }
    }

    async handleFstoryDownload() {
        if (!this.storyData) {
            if (this.fstoryStatus) this.fstoryStatus.textContent = "Load a story first";
            return;
        }

        try {
            this.downloadFstoryBtn.disabled = true;
            if (this.fstoryStatus) this.fstoryStatus.textContent = "Building updated package...";
            const result = await FetchStoryPackage.build(this.storyData, this.currentFstoryContext);
            FetchStoryPackage.download(result.blob, result.fileName);
            if (this.fstoryStatus) this.fstoryStatus.textContent = `${result.fileName} downloaded`;
        } catch (err) {
            console.error(err);
            if (this.fstoryStatus) this.fstoryStatus.textContent = err.message || "Package download failed";
        } finally {
            this.downloadFstoryBtn.disabled = false;
        }
    }

    async setImageFolderPath() {
        const folderPath = this.imageFolderPathInput ? this.imageFolderPathInput.value.trim() : "";

        try {
            const response = await fetch("/api/reader/image-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: folderPath }),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Image path not set");
            }

            this.useLocalImageFolder = Boolean(folderPath);
            localStorage.setItem("readerImageFolderPath", result.path || folderPath);
            this.imageFolderStatus.textContent = result.path ? `Image path set: ${result.path}` : "Image path cleared";

            if (this.storyData) {
                this.initStoryRender(this.storyData);
            }
        } catch (err) {
            console.error(err);
            this.imageFolderStatus.textContent = err.message || "Image path not set";
        }
    }

    // Translation Engine core processes
    async translateCurrentStory() {
        if (!this.storyData) {
            this.translateStatus.textContent = "Please load a JSON file first.";
            return;
        }

        this.translateBtn.disabled = true;
        if (this.stopTranslateBtn) this.stopTranslateBtn.classList.remove("hide");
        this.translateProgressBar.value = 0;
        this.translatedDownloadBtn.classList.add("hide");
        this.notFoundDownloadBtn.classList.add("hide");
        const checksum = this.getStoryChecksum(this.storyData);
        this.updateTranslatorStats({
            totalWords: checksum.words,
            notFoundWords: 0,
            conversionPercent: 0,
        });
        this.translateStatus.textContent = `Checksum ready: ${checksum.pages} posts / ${checksum.chars} chars. Starting translation...`;

        try {
            const response = await fetch("/api/translator/translate-json", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storyData: this.storyData, checksum }),
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Translation failed");
            }

            this.activeTranslationJobId = result.jobId;
            this.watchTranslationProgress(result.jobId);
        } catch (err) {
            console.error(err);
            const message = err && err.message && err.message !== "Failed to fetch" ? err.message : "Translator API not reachable. Restart server and try again.";
            this.translateStatus.textContent = message;
            this.translateBtn.disabled = false;
            if (this.stopTranslateBtn) this.stopTranslateBtn.classList.add("hide");
        }
    }

    async stopCurrentTranslation() {
        if (!this.activeTranslationJobId) return;

        if (this.stopTranslateBtn) this.stopTranslateBtn.disabled = true;
        this.translateStatus.textContent = "Stopping translation...";

        try {
            const response = await fetch(`/api/translator/translate-json/${this.activeTranslationJobId}/cancel`, {
                method: "POST",
                credentials: "same-origin",
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Stop translation failed");
            }

            this.translateStatus.textContent = "Stop requested. Finishing current post...";
        } catch (err) {
            console.error(err);
            this.translateStatus.textContent = err.message || "Stop translation failed.";
            if (this.stopTranslateBtn) this.stopTranslateBtn.disabled = false;
        }
    }

    getStoryChecksum(data) {
        const engPosts = data && data.posts && data.posts.eng ? data.posts.eng : {};
        const keys = Object.keys(engPosts).sort((a, b) => Number(a) - Number(b));

        return {
            pages: keys.length,
            chars: keys.reduce((sum, page) => sum + String(engPosts[page] || "").length, 0),
            words: keys.reduce((sum, page) => sum + this.countWordsFromHtml(engPosts[page] || ""), 0),
        };
    }

    countWordsFromHtml(html) {
        const text = String(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
        return text ? text.split(/\s+/).length : 0;
    }

    updateTranslatorStats(stats = {}) {
        if (this.totalWordsInput && stats.totalWords !== undefined && stats.totalWords !== null) {
            this.totalWordsInput.value = stats.totalWords;
        }
        if (this.notFoundWordsInput && stats.notFoundWords !== undefined && stats.notFoundWords !== null) {
            this.notFoundWordsInput.value = stats.notFoundWords;
        }
        if (this.conversionPercentInput && stats.conversionPercent !== undefined && stats.conversionPercent !== null) {
            this.conversionPercentInput.value = stats.conversionPercent;
        }
    }

    watchTranslationProgress(jobId) {
        const source = new EventSource(`/api/translator/progress/${jobId}`, { withCredentials: true });
        this.activeTranslationSource = source;

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

            this.translateProgressBar.value = processPercent;
            this.updateTranslatorStats({
                totalWords,
                notFoundWords: progress.notFoundWords ?? progress.notFoundCount ?? progress.not_found_words,
                conversionPercent,
            });
            this.translateStatus.textContent = progress.error ? progress.error : `${messageText}Posts ${current}/${total} (${processPercent}%). Words ${translatedWords}/${totalWords} (${conversionPercent}%)${pageText}${checksumText}`;

            if (progress.done) {
                source.close();
                this.activeTranslationSource = null;
                this.activeTranslationJobId = null;
                this.translateBtn.disabled = false;
                if (this.stopTranslateBtn) {
                    this.stopTranslateBtn.disabled = false;
                    this.stopTranslateBtn.classList.add("hide");
                }

                if (progress.error) return;

                if (progress.cancelled) {
                    this.translateStatus.textContent = `Translation stopped. Posts ${current}/${total}. Words ${translatedWords}/${totalWords} (${conversionPercent}%).`;
                    return;
                }

                this.translateProgressBar.value = 100;
                this.translateStatus.textContent = `Translation complete. Words ${translatedWords}/${totalWords} (${conversionPercent}%).`;

                if (progress.translatedFile) {
                    this.translatedDownloadBtn.href = progress.translatedFile;
                    this.translatedDownloadBtn.download = "translated_story.json";
                    this.translatedDownloadBtn.classList.remove("hide");
                    this.replaceLoadedStoryWithTranslated(progress.translatedFile);
                }

                if (progress.notFoundFile) {
                    this.notFoundDownloadBtn.href = progress.notFoundFile;
                    this.notFoundDownloadBtn.download = "not_found_words.json";
                    this.notFoundDownloadBtn.classList.remove("hide");
                    this.updateNotFoundWordCount(progress.notFoundFile);
                }
            }
        };

        source.onerror = () => {
            source.close();
            this.activeTranslationSource = null;
            this.activeTranslationJobId = null;
            this.translateBtn.disabled = false;
            if (this.stopTranslateBtn) {
                this.stopTranslateBtn.disabled = false;
                this.stopTranslateBtn.classList.add("hide");
            }
            this.translateStatus.textContent = "Translation progress connection failed.";
        };
    }

    async updateNotFoundWordCount(notFoundFileUrl) {
        try {
            const response = await fetch(notFoundFileUrl);
            if (!response.ok) return;

            const notFoundWords = await response.json();
            this.updateTranslatorStats({
                notFoundWords: Object.keys(notFoundWords || {}).length,
            });
        } catch (err) {
            console.warn("Not found words count load failed:", err.message);
        }
    }

    async replaceLoadedStoryWithTranslated(translatedFileUrl) {
        try {
            this.translateStatus.textContent = "Translation complete. Loading translated JSON...";
            const response = await fetch(translatedFileUrl);
            if (!response.ok) throw new Error("Translated JSON load failed");

            const translatedStory = await response.json();
            this.fileNameDisplay.textContent = "translated_story.json (Loaded)";
            this.initStoryRender(translatedStory);
            this.translateStatus.textContent = "Translation complete. Loaded translated JSON.";
        } catch (err) {
            console.error(err);
            this.translateStatus.textContent = err.message || "Translation complete, but translated JSON load failed.";
        }
    }

    async saveReaderStoryCache(data) {
        return StoryCache.save(data, { source: "reader", appData: null });
    }

    async loadReaderStoryCache() {
        const record = await StoryCache.load();
        return record?.storyData || null;
    }

    async clearReaderCache() {
        const confirmed = window.confirm("Clear the cached story?");
        if (!confirmed) return;

        if (this.clearCacheBtn) this.clearCacheBtn.disabled = true;
        this.statusDiv.textContent = "Clearing cache...";

        try {
            await StoryCache.clear();

            this.fileNameDisplay.textContent = this.storyData ? "Cache cleared" : "No file chosen";
            this.statusDiv.textContent = "Cache cleared. Reload will not auto-load this story.";
            this.updateReadProgress();
        } catch (err) {
            console.error(err);
            this.statusDiv.textContent = err.message || "Cache clear failed.";
        } finally {
            if (this.clearCacheBtn) this.clearCacheBtn.disabled = false;
        }
    }

    clearReadingProgress() {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith("readerScroll:")) {
                localStorage.removeItem(key);
            }
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.statusDiv.textContent = "Saved reading progress cleared.";
        this.updateReadProgress();
    }

    clearLoadedPackage() {
        if (!this.currentFstoryContext) {
            if (this.fstoryStatus) this.fstoryStatus.textContent = "No package loaded";
            return;
        }
        FetchStoryPackage.dispose(this.currentFstoryContext);
        this.currentFstoryContext = null;
        this.storyData = null;
        this.pageKeys = [];
        this.keyIndex = 0;
        this.contentArea.innerHTML = "Story Content";
        this.titleElement.textContent = "Select or Load a Story...";
        this.fileNameDisplay.textContent = "No file chosen";
        this.statusDiv.textContent = "Local package JSON and image memory cleared.";
        if (this.fstoryStatus) this.fstoryStatus.textContent = "Package cleared";
        this.updateReadProgress();
    }

    async logoutPublicSession() {
        if (this.logoutBtn) this.logoutBtn.disabled = true;
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } catch (err) {
            console.warn("Logout request failed:", err.message);
        } finally {
            window.location.href = "/login.html";
        }
    }

    // Core Story Rendering and parsing routines
    async loadStoryJson() {
        try {
            const cachedStory = await this.loadReaderStoryCache();
            if (cachedStory) {
                this.fileNameDisplay.textContent = "Cached story JSON (Auto-loaded)";
                this.initStoryRender(cachedStory, { saveToCache: false });
                return;
            }
        } catch (err) {
            console.warn("Reader cache load failed:", err.message);
        }

        try {
            const response = await fetch("./story_data.json");
            if (!response.ok) throw new Error("Local file not found");
            const data = await response.json();
            this.fileNameDisplay.textContent = "story_data.json (Auto-loaded)";
            this.initStoryRender(data);
        } catch (err) {
            console.log("No local story_data.json found automatically. Ready for manual browse.");
            this.statusDiv.textContent = "Please browse and select your story_data.json file to start reading.";
        }
    }

    initStoryRender(data, options = {}) {
        this.contentArea.innerHTML = "";
        const normalizedStory = FetchStoryPackage.normalizeStoryLanguages(data);
        this.storyData = this.currentFstoryContext
            ? FetchStoryPackage.materialize(normalizedStory, this.currentFstoryContext)
            : normalizedStory;
        this.keyIndex = 0;
        this.isLoading = false;
        this.statusDiv.textContent = "";

        if (this.loadAllBtn) this.loadAllBtn.style.display = "inline-block";

        const storyName = this.storyData?.meta?.storyName || this.storyData?.storyName || this.storyData?.title || "Story";
        this.titleElement.textContent = storyName;
        document.title = storyName + " - Offline Reader";

        if (this.storyData && this.storyData.posts && this.storyData.posts.eng) {
            this.pageKeys = Object.keys(this.storyData.posts.eng).sort((a, b) => Number(a) - Number(b));
        }

        if (options.saveToCache !== false && !this.currentFstoryContext) {
            this.saveReaderStoryCache(this.storyData).catch((err) => {
                console.warn("Reader cache save failed:", err.message);
            });
        }

        this.loadNextPage();
        this.restoreReaderScrollSoon();
    }

    getReaderScrollKey() {
        if (!this.storyData) return "";
        const posts = this.storyData.posts && this.storyData.posts.eng ? this.storyData.posts.eng : {};
        const identity = [
            this.storyData.meta?.url || this.storyData.url || "",
            this.storyData.meta?.storyName || this.storyData.storyName || this.storyData.title || "",
            this.storyData.meta?.writerName || this.storyData["writer-name"] || this.storyData.writerName || "",
            Object.keys(posts).length,
        ].join("|");
        return `readerScroll:${identity}`;
    }

    getLoadedPostPercent() {
        if (!this.pageKeys.length) return 0;
        return Math.min(100, Math.round((Math.min(this.keyIndex, this.pageKeys.length) / this.pageKeys.length) * 100));
    }

    updateReadProgress() {
        if (!this.readProgress) return;
        this.readProgress.textContent = this.pageKeys.length ? `Loaded: ${Math.min(this.keyIndex, this.pageKeys.length)}/${this.pageKeys.length} posts (${this.getLoadedPostPercent()}%)` : "Loaded: 0/0 posts (0%)";
    }

    saveReaderScroll(force = false) {
        if (!this.storyData || this.isRestoringScroll) return;

        const now = Date.now();
        if (!force && now - this.lastScrollSaveAt < 3000) return;

        const key = this.getReaderScrollKey();
        if (!key) return;

        this.lastScrollSaveAt = now;
        localStorage.setItem(
            key,
            JSON.stringify({
                y: Math.max(0, window.scrollY || document.documentElement.scrollTop || 0),
                percent: this.getLoadedPostPercent(),
                updatedAt: new Date().toISOString(),
            }),
        );
    }

    async restoreReaderScrollSoon() {
        const key = this.getReaderScrollKey();
        if (!key) return;

        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(key) || "null");
        } catch (err) {
            saved = null;
        }

        if (!saved || !Number.isFinite(Number(saved.y)) || Number(saved.y) <= 0) {
            this.updateReadProgress();
            return;
        }

        this.isRestoringScroll = true;
        const targetY = Number(saved.y);

        for (let attempt = 0; attempt < 30; attempt++) {
            const scrollableHeight = document.documentElement.scrollHeight;
            if (scrollableHeight >= targetY + window.innerHeight || this.keyIndex >= this.pageKeys.length) {
                break;
            }
            this.isLoading = false;
            this.loadNextPage();
            await new Promise((resolve) => setTimeout(resolve, 80));
        }

        setTimeout(() => {
            window.scrollTo({ top: targetY, behavior: "auto" });
            this.updateReadProgress();
            this.isRestoringScroll = false;
        }, 120);
    }

    normalizeStoryImages(container) {
        if (!container) return;
        const images = container.getElementsByTagName("img");

        for (const img of images) {
            const currentSrc = img.getAttribute("src");
            if (!currentSrc) continue;

            const fileName = this.getImageFileName(currentSrc);
            const objectUrl = this.imageFileMap.get(fileName);

            if (objectUrl) {
                img.setAttribute("src", objectUrl);
            }
        }
    }

    getImageFileName(src) {
        const cleanSrc = String(src).split("?")[0].split("#")[0];
        const parts = cleanSrc.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || "";
    }

    loadNextPage() {
        if (this.isLoading || !this.storyData || this.pageKeys.length === 0) return;

        if (this.keyIndex >= this.pageKeys.length) {
            this.statusDiv.textContent = "— End of Story —";
            if (this.loadAllBtn) this.loadAllBtn.style.display = "none";
            return;
        }

        this.isLoading = true;
        const actualPageNum = this.pageKeys[this.keyIndex];
        this.statusDiv.textContent = "Checking Content Part " + actualPageNum + "...";

        const currentPosts = this.storyData.posts?.[this.currentLang] || {};
        let pageHtml = currentPosts[actualPageNum] || "";

        const isHtmlEmpty = !pageHtml || pageHtml.replace(/<[^>]*>/g, "").trim() === "";

        if (!isHtmlEmpty) {
            const pageDiv = document.createElement("div");
            pageDiv.className = "story-page";
            pageDiv.setAttribute("data-page-num", actualPageNum);

            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = pageHtml;

            this.normalizeStoryImages(tempDiv);

            pageDiv.innerHTML = tempDiv.innerHTML;
            this.contentArea.appendChild(pageDiv);

            this.keyIndex++;
            this.updateReadProgress();
            this.statusDiv.textContent = "";
            this.isLoading = false;

            setTimeout(() => {
                const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight);
                if (docHeight <= window.innerHeight && this.keyIndex < this.pageKeys.length) {
                    this.loadNextPage();
                }
            }, 100);
        } else {
            const pageDiv = document.createElement("div");
            pageDiv.className = "story-page";
            pageDiv.setAttribute("data-page-num", actualPageNum);
            pageDiv.innerHTML = `<p style="color: #999; font-style: italic; text-align: center;">[Part ${actualPageNum} Content Not Available in ${this.currentLang === "eng" ? "English" : "Hindi"}]</p>`;
            this.contentArea.appendChild(pageDiv);

            this.keyIndex++;
            this.updateReadProgress();
            this.isLoading = false;

            setTimeout(() => {
                this.loadNextPage();
            }, 50);
        }
    }

    loadWholeStory() {
        if (!this.storyData || this.pageKeys.length === 0) return;
        this.statusDiv.textContent = "Loading all parts together...";
        while (this.keyIndex < this.pageKeys.length) {
            this.isLoading = false;
            this.loadNextPage();
        }
        if (this.loadAllBtn) this.loadAllBtn.style.display = "none";
    }

    handlePrint() {
        if (this.keyIndex < this.pageKeys.length) {
            const confirmPrint = confirm("पूरी कहानी अभी लोड नहीं हुई है। क्या आप प्रिंट करने से पहले सभी पार्ट्स लोड करना चाहते हैं?");
            if (confirmPrint) {
                this.loadWholeStory();
                setTimeout(() => { window.print(); }, 500);
            } else {
                window.print();
            }
        } else {
            window.print();
        }
    }

    toggleLanguage() {
        if (!this.storyData) return;

        if (this.currentLang === "eng") {
            this.currentLang = "hin";
            this.langToggleBtn.textContent = "🌐 Switch to English";
            this.langToggleBtn.style.background = "#28a745";
        } else {
            this.currentLang = "eng";
            this.langToggleBtn.textContent = "🌐 Switch to Hindi";
            this.langToggleBtn.style.background = "#007bff";
        }

        const loadedPages = this.contentArea.getElementsByClassName("story-page");

        for (let i = 0; i < loadedPages.length; i++) {
            const pNum = loadedPages[i].getAttribute("data-page-num");
            const currentPosts = this.storyData.posts?.[this.currentLang] || {};
            let newHtml = currentPosts[pNum] || "";
            const isHtmlEmpty = !newHtml || newHtml.replace(/<[^>]*>/g, "").trim() === "";

            if (!isHtmlEmpty) {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = newHtml;
                this.normalizeStoryImages(tempDiv);
                loadedPages[i].innerHTML = tempDiv.innerHTML;
            } else {
                loadedPages[i].innerHTML = `<p style="color: #999; font-style: italic; text-align: center;">[Part ${pNum} Content Not Available in ${this.currentLang === "eng" ? "English" : "Hindi"}]</p>`;
            }
        }
    }

    handleImageFolderSelect(event) {
        for (const objectUrl of this.imageFileMap.values()) {
            URL.revokeObjectURL(objectUrl);
        }
        this.imageFileMap.clear();
        const files = Array.from(event.target.files || []);

        for (const file of files) {
            const fileName = file.name;
            const objectUrl = URL.createObjectURL(file);
            this.imageFileMap.set(fileName, objectUrl);
        }

        document.getElementById("image-folder-status").textContent = `${files.length} images loaded`;

        this.normalizeStoryImages(this.contentArea);

        setTimeout(() => {
            this.normalizeStoryImages(this.contentArea);
        }, 100);
    }

    // Global Window Level Hooks
    handleWindowScroll() {
        this.updateReadProgress();
        this.saveReaderScroll();

        const totalHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const currentScroll = window.innerHeight + (window.scrollY || document.documentElement.scrollTop);
        if (currentScroll >= totalHeight - 800) {
            this.loadNextPage();
        }
    }

    handleWindowBeforeUnload() {
        this.saveReaderScroll(true);
        FetchStoryPackage.dispose(this.currentFstoryContext);
        for (const objectUrl of this.imageFileMap.values()) {
            URL.revokeObjectURL(objectUrl);
        }
        this.imageFileMap.clear();
    }

    handleDocumentOutsideClick(e) {
        if (this.sideBar && !this.sideBar.contains(e.target) && !e.target.closest(".sidebar-toggle-btn")) {
            this.sideBar.classList.remove("open");
            if (this.toggleText) this.toggleText.textContent = "Menu";
        }
    }

    // Data Getters (Encapsulated)
    getStoryName() { return this.storyData?.meta?.storyName || this.storyData?.storyName || this.storyData?.title || "Story"; }
    getWriterName() { return this.storyData?.meta?.writerName || this.storyData?.["writer-name"] || this.storyData?.writerName || ""; }
    getStoryUrl() { return this.storyData?.meta?.url || this.storyData?.url || ""; }
    getTotalPage() { return Number(this.storyData?.fetch?.totalPage || this.storyData?.totalPage || 0); }
    getPosts(lang = this.currentLang) { return this.storyData?.posts?.[lang] || {}; }
}

// Instance initialization on DOM Content Loaded
document.addEventListener("DOMContentLoaded", () => {
    new StoryReader();
});
