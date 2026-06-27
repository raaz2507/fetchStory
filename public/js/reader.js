import FetchStoryPackage from "./fstory.js?v=9";
import StoryCache from "./storyCache.js?v=3";

export class StoryReader {
    constructor() {
        this.CONFIG = {
            ACTIVE_TRANSLATION_KEY: "fetchStory:activeTranslation",
        };

        // State Variables
        this.storyData = null;
        this.pageKeys = [];
        this.keyIndex = 0;
        this.isLoading = false;
        this.currentLang = "eng";
        this.currentFontSize = 1.1; // Default em size
        this.activeTranslationJobId = null;
        this.activeTranslationSource = null;
        this.lastScrollSaveAt = 0;
        this.isRestoringScroll = false;
        this.isPreparingPrint = false;
        this.activePdfJobId = null;
        this.pdfPollTimer = null;
        this.currentFstoryContext = null;
        this.lastChromeScrollY = 0;
        this.isReaderChromeHidden = false;

        // DOM Elements Initialization
        this.initElements();

        // Agar content area window me maujood hai tabhi initialize karein
        if (this.contentArea) {
            this.initFetchOverride();
            this.initEvents();
            this.setPdfControls({ running: false });
            this.initializeReader();
        }
    }

    async initializeReader() {
        await this.loadStoryJson();
        this.restoreActiveTranslation();
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
        this.sideBar = document.getElementById("reader-tool-panel");
        this.toolPanelButtons = Array.from(document.querySelectorAll("[data-tool-panel-button]"));
        this.toolPanels = Array.from(document.querySelectorAll("[data-tool-panel]"));
        this.panelCloseButtons = Array.from(document.querySelectorAll("[data-close-panel]"));
        this.sidebarToggleBtn = null;
        this.toggleText = null;
        this.sidebarCloseBtn = null;
        this.sidebarBackdrop = document.getElementById("sidebar-backdrop");
        this.readingProgressFill = document.getElementById("reading-progress-fill");
        this.decreaseFontBtn = document.getElementById("decrease-font-btn");
        this.increaseFontBtn = document.getElementById("increase-font-btn");
        this.themeSelect = document.getElementById("theme-select");
        this.bgColorPicker = document.getElementById("bg-color-picker");
        this.translateBtn = document.getElementById("translateBtn");
        this.stopTranslateBtn = document.getElementById("stopTranslateBtn");
        this.translateStatus = document.getElementById("status");
        this.translateProgressBar = document.getElementById("progressBar");
        this.onlineDictionaryStatus = document.getElementById("online-dictionary-status");
        this.offlineDictionaryStatus = document.getElementById("offline-dictionary-status");
        this.onlineDictionaryLabel = document.getElementById("online-dictionary-label");
        this.offlineDictionaryLabel = document.getElementById("offline-dictionary-label");
        this.translatedDownloadBtn = document.getElementById("downloadBtn");
        this.notFoundDownloadBtn = document.getElementById("downloadNotFoundBtn");
        this.clearCacheBtn = document.getElementById("clear-cache-btn");
        this.clearReadingProgressBtn = document.getElementById("clear-reading-progress-btn");
        this.readProgress = document.getElementById("read-progress");
        this.readerTabBtn = document.querySelector('[data-tool-panel-button="reader"]');
        this.translatorTabBtn = document.querySelector('[data-tool-panel-button="translator"]');
        this.exportTabBtn = document.querySelector('[data-tool-panel-button="export"]');
        this.readerTabPanel = document.getElementById("reader-tool-panel");
        this.translatorTabPanel = document.getElementById("translator-tool-panel");
        this.exportTabPanel = document.getElementById("export-tool-panel");
        this.totalWordsInput = document.getElementById("total_words");
        this.notFoundWordsInput = document.getElementById("not_found_words");
        this.conversionPercentInput = document.getElementById("con_per");
        this.logoutBtn = document.getElementById("logoutBtn");
        this.fstoryFileInput = document.getElementById("fstoryFile");
        this.downloadFstoryBtn = document.getElementById("downloadFstoryBtn");
        this.clearFstoryBtn = document.getElementById("clearFstoryBtn");
        this.fstoryStatus = document.getElementById("fstory-status");
        this.fstoryProgress = document.getElementById("fstory-progress");
        this.pdfStartBtn = document.getElementById("pdf-start-btn");
        this.pdfStopBtn = document.getElementById("pdf-stop-btn");
        this.pdfProgressLabel = document.getElementById("pdf-progress-label");
        this.pdfProgressPercent = document.getElementById("pdf-progress-percent");
        this.pdfProgressBar = document.getElementById("pdf-progress-bar");
        this.pdfPageStatus = document.getElementById("pdf-page-status");
        this.pdfDownloadLink = document.getElementById("pdf-download-link");
        this.pdfPageSizeSelect = document.getElementById("pdf-page-size");
        this.pdfOrientationSelect = document.getElementById("pdf-orientation");
        this.pdfMarginSelect = document.getElementById("pdf-margin");
        this.pdfLanguageSelect = document.getElementById("pdf-language");
        this.pdfIncludeImagesInput = document.getElementById("pdf-include-images");
        this.txtDownloadBtn = document.getElementById("txt-download-btn");
        this.txtProgressLabel = document.getElementById("txt-progress-label");
        this.txtProgressPercent = document.getElementById("txt-progress-percent");
        this.txtProgressBar = document.getElementById("txt-progress-bar");
        this.txtPageStatus = document.getElementById("txt-page-status");
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
        this.toolPanelButtons.forEach((button) => {
            button.addEventListener("click", (event) => this.toggleToolPanel(button.dataset.toolPanelButton, event));
        });
        this.panelCloseButtons.forEach((button) => {
            button.addEventListener("click", () => this.closeSidebar());
        });
        if (this.sidebarBackdrop) this.sidebarBackdrop.addEventListener("click", () => this.closeSidebar());
        if (this.loadAllBtn) this.loadAllBtn.addEventListener("click", () => this.loadWholeStory());
        if (this.decreaseFontBtn) this.decreaseFontBtn.addEventListener("click", () => this.adjustFontSize(-0.1));
        if (this.increaseFontBtn) this.increaseFontBtn.addEventListener("click", () => this.adjustFontSize(0.1));
        if (this.themeSelect) this.themeSelect.addEventListener("change", () => this.changeTheme(this.themeSelect.value));
        if (this.bgColorPicker) this.bgColorPicker.addEventListener("input", () => this.setCustomBg(this.bgColorPicker.value));
        if (this.langToggleBtn) this.langToggleBtn.addEventListener("click", () => this.toggleLanguage());
        if (this.printBtn) this.printBtn.addEventListener("click", () => this.handlePrint());
        if (this.pdfStartBtn) this.pdfStartBtn.addEventListener("click", () => this.startPdfExport());
        if (this.pdfStopBtn) this.pdfStopBtn.addEventListener("click", () => this.stopPdfExport());
        if (this.txtDownloadBtn) this.txtDownloadBtn.addEventListener("click", () => this.downloadSelectedSectionTxt());
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

        // Window/Document scope global listeners
        window.addEventListener("scroll", () => this.handleWindowScroll());
        window.addEventListener("beforeunload", () => this.handleWindowBeforeUnload());
        document.addEventListener("click", (e) => this.handleDocumentOutsideClick(e));

    }

    // Sidebar management methods
    switchSidebarTab(tabName) {
        this.openToolPanel(tabName);
    }

    toggleToolPanel(panelName, event) {
        if (event) event.stopPropagation();
        const panel = this.getToolPanel(panelName);
        if (!panel) return;
        if (panel.classList.contains("is-open")) {
            this.closeSidebar();
            return;
        }
        this.openToolPanel(panelName);
    }

    openToolPanel(panelName) {
        const targetPanel = this.getToolPanel(panelName) || this.readerTabPanel;
        if (!targetPanel) return;
        const targetName = targetPanel.dataset.toolPanel;
        this.toolPanels.forEach((panel) => {
            panel.classList.toggle("is-open", panel === targetPanel);
        });
        this.sideBar = targetPanel;
        this.syncSidebarState(targetName);
    }

    getToolPanel(panelName) {
        return this.toolPanels.find((panel) => panel.dataset.toolPanel === panelName) || null;
    }

    toggleSidebar(event) {
        this.toggleToolPanel("reader", event);
    }

    closeSidebar() {
        this.toolPanels.forEach((panel) => panel.classList.remove("is-open"));
        this.syncSidebarState();
    }

    syncSidebarState(activePanelName = "") {
        const isOpen = this.toolPanels.some((panel) => panel.classList.contains("is-open"));
        this.toolPanelButtons.forEach((button) => {
            const isActive = Boolean(activePanelName) && button.dataset.toolPanelButton === activePanelName;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-expanded", String(isActive));
        });
        if (this.sidebarBackdrop) {
            this.sidebarBackdrop.hidden = !isOpen;
            this.sidebarBackdrop.classList.toggle("is-visible", isOpen);
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

    async handleFstoryFileChange() {
        const file = this.fstoryFileInput.files && this.fstoryFileInput.files[0];
        if (!file) return;

        try {
            if (this.fstoryStatus) this.fstoryStatus.textContent = "Opening package...";
            if (this.fstoryProgress) {
                this.fstoryProgress.hidden = false;
                this.fstoryProgress.value = 0;
            }
            const opened = await FetchStoryPackage.open(file, {
                onProgress: (progress) => this.updateFstoryProgress(progress),
            });
            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = opened.context;
            this.fileNameDisplay.textContent = `${file.name} (${opened.manifest.contentFile})`;
            this.initStoryRender(opened.rawStoryData, { saveToCache: false });
            this.updateFstoryProgress({
                label: "Saving story",
                detail: "Writing browser cache",
                overallPercent: 97,
            });
            await StoryCache.saveFstoryPackage(opened.rawStoryData, opened.context, {
                packageName: file.name,
            });
            this.updateFstoryProgress({
                label: "Package loaded",
                detail: `${opened.context.images.size} images ready`,
                overallPercent: 100,
            });
        } catch (err) {
            console.error(err);
            if (this.fstoryStatus) this.fstoryStatus.textContent = err.message || "Invalid .fstory";
            this.statusDiv.textContent = "Error: Could not open FetchStory package.";
        } finally {
            this.fstoryFileInput.value = "";
        }
    }

    updateFstoryProgress(progress) {
        const percent = Math.max(0, Math.min(100, Number(progress.overallPercent) || 0));
        if (this.fstoryProgress) {
            this.fstoryProgress.hidden = false;
            this.fstoryProgress.value = percent;
        }
        if (this.fstoryStatus) {
            const count = progress.total ? ` · ${progress.current} / ${progress.total}` : "";
            const detail = progress.detail ? ` — ${progress.detail}` : "";
            this.fstoryStatus.textContent = `${progress.label || "Opening package"} · ${percent}%${count}${detail}`;
        }
    }

    async handleFstoryDownload() {
        if (!this.storyData) {
            if (this.fstoryStatus) this.fstoryStatus.textContent = "Load a story first";
            return;
        }

        try {
            this.downloadFstoryBtn.disabled = true;
            this.updateFstoryProgress({
                label: "Building updated package",
                detail: "Preparing story and images",
                overallPercent: 1,
            });
            const result = await FetchStoryPackage.build(this.storyData, this.currentFstoryContext, {
                onProgress: (progress) => this.updateFstoryProgress(progress),
            });
            FetchStoryPackage.download(result.blob, result.fileName);
            this.updateFstoryProgress({
                label: "Package downloaded",
                detail: result.fileName,
                overallPercent: 100,
            });
        } catch (err) {
            console.error(err);
            if (this.fstoryStatus) this.fstoryStatus.textContent = err.message || "Package download failed";
        } finally {
            this.downloadFstoryBtn.disabled = false;
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
        this.updateDictionaryIndicators("checking");
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
            this.saveActiveTranslation({
                jobId: result.jobId,
                translatedFile: result.translatedFile,
                notFoundFile: result.notFoundFile,
                checksum,
            });
            this.watchTranslationProgress(result.jobId);
        } catch (err) {
            console.error(err);
            const message = err && err.message && err.message !== "Failed to fetch" ? err.message : "Translator API not reachable. Restart server and try again.";
            this.translateStatus.textContent = message;
            this.updateDictionaryIndicators("error");
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

    updateDictionaryIndicators(source = "") {
        const normalized = String(source || "").toLowerCase();
        const onlineReady = normalized === "github" || normalized === "online";
        const offlineReady = normalized === "local" || normalized === "offline";
        const checking = normalized === "checking" || normalized === "loading";

        if (this.onlineDictionaryStatus) {
            this.onlineDictionaryStatus.classList.toggle("is-ready", onlineReady);
        }
        if (this.offlineDictionaryStatus) {
            this.offlineDictionaryStatus.classList.toggle("is-ready", offlineReady);
        }

        if (this.onlineDictionaryLabel) {
            this.onlineDictionaryLabel.textContent = onlineReady
                ? "Found and active"
                : checking
                    ? "Checking..."
                    : "Not found";
        }
        if (this.offlineDictionaryLabel) {
            this.offlineDictionaryLabel.textContent = offlineReady
                ? "Found and active"
                : checking
                    ? "Waiting fallback"
                    : "Not active";
        }
    }

    watchTranslationProgress(jobId) {
        if (this.activeTranslationSource) this.activeTranslationSource.close();
        this.activeTranslationJobId = jobId;
        this.translateBtn.disabled = true;
        if (this.stopTranslateBtn) {
            this.stopTranslateBtn.disabled = false;
            this.stopTranslateBtn.classList.remove("hide");
        }

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
            if (progress.dictionarySource) {
                this.updateDictionaryIndicators(progress.dictionarySource);
            }

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
                this.clearActiveTranslation();
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
            this.translateStatus.textContent = "Translation progress connection lost. Refresh to reconnect.";
        };
    }

    restoreActiveTranslation() {
        const saved = this.loadActiveTranslation();
        if (!saved?.jobId) return false;

        this.switchSidebarTab("translator");
        this.translateStatus.textContent = "Reconnecting to active translation...";
        if (saved.checksum) {
            this.updateTranslatorStats({
                totalWords: saved.checksum.words || 0,
                notFoundWords: 0,
                conversionPercent: 0,
            });
        }
        this.watchTranslationProgress(saved.jobId);
        return true;
    }

    saveActiveTranslation(context) {
        localStorage.setItem(this.CONFIG.ACTIVE_TRANSLATION_KEY, JSON.stringify({
            ...context,
            savedAt: new Date().toISOString(),
        }));
    }

    loadActiveTranslation() {
        try {
            return JSON.parse(localStorage.getItem(this.CONFIG.ACTIVE_TRANSLATION_KEY) || "null");
        } catch (_) {
            this.clearActiveTranslation();
            return null;
        }
    }

    clearActiveTranslation() {
        localStorage.removeItem(this.CONFIG.ACTIVE_TRANSLATION_KEY);
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
        return StoryCache.load();
    }

    async clearReaderCache() {
        const confirmed = window.confirm("Clear the cached story?");
        if (!confirmed) return;

        if (this.clearCacheBtn) this.clearCacheBtn.disabled = true;
        this.statusDiv.textContent = "Clearing cache...";

        try {
            await StoryCache.clear();

            if (!this.currentFstoryContext) {
                this.resetReaderArticle("Cache cleared. Load or open a story to start reading.");
            }
            this.fileNameDisplay.textContent = "No file chosen";
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

    async clearLoadedPackage() {
        if (!this.currentFstoryContext) {
            if (this.fstoryStatus) this.fstoryStatus.textContent = "No package loaded";
            return;
        }
        FetchStoryPackage.dispose(this.currentFstoryContext);
        this.currentFstoryContext = null;
        await StoryCache.clear().catch((err) => {
            console.warn("Package cache clear failed:", err.message);
        });
        this.resetReaderArticle("Local package JSON and image memory cleared.");
        if (this.fstoryStatus) this.fstoryStatus.textContent = "Package cleared";
    }

    resetReaderArticle(message = "Load or open a story to start reading.") {
        this.clearPdfPollTimer();
        this.activePdfJobId = null;
        this.storyData = null;
        this.pageKeys = [];
        this.keyIndex = 0;
        this.isLoading = false;
        if (this.contentArea) this.contentArea.innerHTML = "";
        if (this.titleElement) this.titleElement.textContent = "Select or Load a Story...";
        if (this.fileNameDisplay) this.fileNameDisplay.textContent = "No file chosen";
        if (this.statusDiv) this.statusDiv.textContent = message;
        if (this.readProgress) this.readProgress.textContent = "Read: 0%";
        if (this.readingProgressFill) this.readingProgressFill.style.width = "0%";
        this.updateDictionaryIndicators("");
        this.setPdfControls({ running: false });
        this.updatePdfProgress({ progress: 0, currentPage: 0, totalPages: 0, message: "Idle" });
        this.updateTxtProgress({ progress: 0, currentPage: 0, totalPages: 0, message: "TXT idle" });
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
            const cachedRecord = await this.loadReaderStoryCache();
            if (cachedRecord?.source === "fstory" && (cachedRecord.appData?.packageStored || cachedRecord.appData?.packageBlob)) {
                const opened = await this.openCachedFstoryPackage(cachedRecord);
                this.initStoryRender(opened.rawStoryData, { saveToCache: false });
                return;
            }
            if (cachedRecord?.storyData) {
                this.fileNameDisplay.textContent = cachedRecord.source === "fstory"
                    ? "Cached .fstory JSON (images need package reopen)"
                    : "Cached story JSON (Auto-loaded)";
                this.initStoryRender(cachedRecord.storyData, { saveToCache: false });
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

    async openCachedFstoryPackage(record) {
        const storedPackage = await StoryCache.loadFstoryPackage();
        if (storedPackage?.meta) {
            const context = FetchStoryPackage.createContextFromStoredPackage(storedPackage);
            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = context;
            this.fileNameDisplay.textContent = `${context.sourceName} (${context.contentFile})`;
            this.updateFstoryProgress({
                label: "Package restored",
                detail: `${context.images.size} stored images ready`,
                overallPercent: 100,
            });
            return {
                rawStoryData: record.storyData,
                context,
                manifest: context.manifest,
            };
        }

        const appData = record.appData || {};
        const packageBlob = appData.packageBlob;
        if (!packageBlob) throw new Error("Cached .fstory package missing");

        const packageName = appData.packageName || "cached-story.fstory";
        const packageFile = packageBlob instanceof File
            ? packageBlob
            : new File([packageBlob], packageName, { type: packageBlob.type || "application/zip" });

        if (this.fstoryStatus) this.fstoryStatus.textContent = "Restoring cached .fstory package...";
        if (this.fstoryProgress) {
            this.fstoryProgress.hidden = false;
            this.fstoryProgress.value = 0;
        }

        const opened = await FetchStoryPackage.open(packageFile, {
            onProgress: (progress) => this.updateFstoryProgress(progress),
        });
        FetchStoryPackage.dispose(this.currentFstoryContext);
        this.currentFstoryContext = opened.context;
        this.fileNameDisplay.textContent = `${packageName} (${opened.manifest.contentFile})`;
        this.updateFstoryProgress({
            label: "Package restored",
            detail: `${opened.context.images.size} images ready`,
            overallPercent: 100,
        });
        return opened;
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
        this.setPdfControls({ running: false });
        this.updatePdfProgress({ progress: 0, currentPage: 0, totalPages: this.pageKeys.length, message: "Idle" });
        this.updateTxtProgress({ progress: 0, currentPage: 0, totalPages: 0, message: "TXT idle" });
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

    getReadingPercent() {
        if (!this.storyData) return 0;
        const scrollableHeight = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (!scrollableHeight) return this.keyIndex >= this.pageKeys.length ? 100 : 0;
        return Math.max(0, Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100)));
    }

    updateReadProgress() {
        if (!this.readProgress) return;
        const percent = this.getReadingPercent();
        this.readProgress.textContent = this.pageKeys.length
            ? `${percent}% · ${Math.min(this.keyIndex, this.pageKeys.length)}/${this.pageKeys.length} parts loaded`
            : "0% · No story";
        if (this.readingProgressFill) this.readingProgressFill.style.width = `${percent}%`;
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

    loadNextPage() {
        if (this.isPreparingPrint || this.isLoading || !this.storyData || this.pageKeys.length === 0) return;

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

    handlePrintLegacy() {
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

    async handlePrint() {
        if (!this.storyData || this.isPreparingPrint) return;

        this.isPreparingPrint = true;
        const originalButtonText = this.printBtn.textContent;
        this.printBtn.disabled = true;
        this.printBtn.textContent = "Preparing PDF…";

        try {
            await this.prepareStoryForPrint();
            await this.waitForPrintAssets();
            this.statusDiv.textContent = "Opening Print / Save as PDF...";
            await this.waitForRenderFrames(2);
            window.print();
        } catch (err) {
            console.error("Print preparation failed:", err);
            this.statusDiv.textContent = err.message || "Could not prepare the story for printing.";
        } finally {
            this.isPreparingPrint = false;
            this.printBtn.disabled = false;
            this.printBtn.textContent = originalButtonText;
        }
    }

    async startPdfExport() {
        if (!this.storyData || this.activePdfJobId) return;

        this.setPdfControls({ running: true });
        this.updatePdfProgress({
            status: "queued",
            progress: 0,
            currentPage: 0,
            totalPages: this.pageKeys.length,
            message: "Starting PDF export",
        });

        try {
            const pdfSettings = this.getPdfSettings();
            const pdfStoryData = await this.prepareStoryDataForPdf(pdfSettings);
            this.updatePdfProgress({
                status: "preparing",
                progress: 20,
                currentPage: 0,
                totalPages: this.pageKeys.length,
                message: "Sending PDF job to server",
            });
            const response = await this.fetchWithTimeout("/api/reader/pdf-jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    storyData: pdfStoryData,
                    settings: pdfSettings,
                }),
            }, 90000);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not start PDF export.");

            this.activePdfJobId = payload.id;
            this.updatePdfProgress(payload);
            this.pollPdfJob();
        } catch (err) {
            this.activePdfJobId = null;
            this.setPdfControls({ running: false });
            if (err && /section empty/i.test(err.message || "")) {
                window.alert(err.message);
            }
            this.updatePdfProgress({
                status: "failed",
                progress: 0,
                currentPage: 0,
                totalPages: this.pageKeys.length,
                message: err.message || "PDF export failed.",
                error: err.message,
            });
        }
    }

    async stopPdfExport() {
        if (!this.activePdfJobId) return;
        const jobId = this.activePdfJobId;
        this.clearPdfPollTimer();
        this.updatePdfProgress({
            status: "cancelled",
            progress: Number(this.pdfProgressBar?.value || 0),
            currentPage: 0,
            totalPages: this.pageKeys.length,
            message: "Stopping PDF export...",
        });

        try {
            const response = await fetch(`/api/reader/pdf-jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not stop PDF export.");
            this.updatePdfProgress(payload);
        } catch (err) {
            this.updatePdfProgress({
                status: "failed",
                progress: Number(this.pdfProgressBar?.value || 0),
                currentPage: 0,
                totalPages: this.pageKeys.length,
                message: err.message || "Could not stop PDF export.",
            });
        } finally {
            this.activePdfJobId = null;
            this.setPdfControls({ running: false });
        }
    }

    async pollPdfJob() {
        if (!this.activePdfJobId) return;

        try {
            const response = await fetch(`/api/reader/pdf-jobs/${encodeURIComponent(this.activePdfJobId)}`);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not read PDF progress.");

            this.updatePdfProgress(payload);
            if (["completed", "failed", "cancelled"].includes(payload.status)) {
                this.activePdfJobId = null;
                this.setPdfControls({ running: false });
                return;
            }
        } catch (err) {
            this.activePdfJobId = null;
            this.setPdfControls({ running: false });
            this.updatePdfProgress({
                status: "failed",
                progress: Number(this.pdfProgressBar?.value || 0),
                currentPage: 0,
                totalPages: this.pageKeys.length,
                message: err.message || "PDF progress failed.",
            });
            return;
        }

        this.pdfPollTimer = window.setTimeout(() => this.pollPdfJob(), 1200);
    }

    getPdfSettings() {
        const selectedLanguage = this.pdfLanguageSelect?.value || "eng";
        return {
            pageSize: this.pdfPageSizeSelect?.value || "A4",
            orientation: this.pdfOrientationSelect?.value || "portrait",
            margin: this.pdfMarginSelect?.value || "normal",
            language: selectedLanguage === "hin" ? "hin" : "eng",
            includeImages: this.pdfIncludeImagesInput ? this.pdfIncludeImagesInput.checked : true,
        };
    }

    async prepareStoryDataForPdf(pdfSettings = this.getPdfSettings()) {
        const includeImages = pdfSettings.includeImages !== false;
        const language = this.getEffectivePdfLanguage(pdfSettings);
        pdfSettings.language = language;
        const story = FetchStoryPackage.normalizeStoryLanguages(this.cloneStoryForExport());
        const selectedPosts = story.posts[language] || {};
        if (!Object.keys(selectedPosts).length) {
            const label = language === "hin" ? "Hindi" : "English";
            throw new Error(`${label} section empty hai. PDF export ke liye pehle ${label} section me content add/translate kare.`);
        }

        if (!includeImages || !this.currentFstoryContext) {
            this.updatePdfProgress({
                status: "preparing",
                progress: 12,
                currentPage: 0,
                totalPages: this.pageKeys.length,
                message: includeImages ? "Preparing story HTML" : "Preparing story without images",
            });
            story.posts = {
                eng: language === "eng" ? selectedPosts : {},
                hin: language === "hin" ? selectedPosts : {},
            };
            return story;
        }

        story.posts = {
            eng: language === "eng" ? selectedPosts : {},
            hin: language === "hin" ? selectedPosts : {},
        };
        const preprocessItems = this.getPdfPreprocessItems(story, language);
        const totalPosts = preprocessItems.length;
        const totalImages = preprocessItems.reduce((count, item) => count + item.images.length, 0);
        let processedPosts = 0;
        this.updatePdfProgress({
            status: "preparing",
            progress: 3,
            currentPage: 0,
            totalPages: this.pageKeys.length,
            message: totalImages
                ? `Pre-processing images 0/${totalImages}`
                : `Pre-processing posts 0/${totalPosts}`,
        });
        const uniquePackagePaths = [...new Set(preprocessItems.flatMap((item) => item.images))];
        const assetUrls = totalImages
            ? await this.uploadPdfAssetsInBatches(uniquePackagePaths)
            : new Map();

        for (const item of preprocessItems) {
            story.posts[item.language][item.key] = this.replacePackageImagesWithAssetUrls(
                String(story.posts[item.language][item.key] || ""),
                assetUrls,
            );
            processedPosts++;
            const progress = 15 + Math.round((processedPosts / Math.max(totalPosts, 1)) * 3);
            this.updatePdfProgress({
                status: "preparing",
                progress,
                currentPage: processedPosts,
                totalPages: totalPosts,
                message: totalImages
                    ? `Linking PDF images in posts ${processedPosts}/${totalPosts}`
                    : `Pre-processing posts ${processedPosts}/${totalPosts}`,
            });
        }

        this.updatePdfProgress({
            status: "preparing",
            progress: 18,
            currentPage: totalPosts,
            totalPages: totalPosts,
            message: totalImages
                ? `Package images uploaded (${assetUrls.size}/${uniquePackagePaths.length})`
                : "No package images to embed",
        });
        return story;
    }

    async uploadPdfAssetsInBatches(packagePaths) {
        const assetJobId = this.createClientJobId();
        const assetUrls = new Map();
        const batchSize = 3;
        let uploaded = 0;

        for (let index = 0; index < packagePaths.length; index += batchSize) {
            const batchPaths = packagePaths.slice(index, index + batchSize);
            const assets = [];

            for (const packagePath of batchPaths) {
                this.updatePdfProgress({
                    status: "preparing",
                    progress: 3 + Math.round((uploaded / Math.max(packagePaths.length, 1)) * 10),
                    currentPage: uploaded,
                    totalPages: packagePaths.length,
                    message: `Preparing image ${uploaded + 1}/${packagePaths.length}: ${this.getFileName(packagePath)}`,
                });
                const dataUrl = await this.getPackageImageDataUrl(packagePath, new Map());
                if (!dataUrl) continue;
                assets.push({
                    key: packagePath,
                    fileName: this.getFileName(packagePath),
                    dataUrl,
                });
                uploaded++;
            }

            if (!assets.length) continue;
            this.updatePdfProgress({
                status: "preparing",
                progress: 3 + Math.round((uploaded / Math.max(packagePaths.length, 1)) * 10),
                currentPage: uploaded,
                totalPages: packagePaths.length,
                message: `Uploading PDF image batch ${Math.floor(index / batchSize) + 1}/${Math.ceil(packagePaths.length / batchSize)}`,
            });

            const response = await this.fetchWithTimeout("/api/reader/pdf-assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetJobId, assets }),
            }, 90000);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "PDF image upload failed.");
            for (const [key, url] of Object.entries(payload.urls || {})) {
                assetUrls.set(key, url);
            }
        }

        return assetUrls;
    }

    getEffectivePdfLanguage(pdfSettings) {
        const requested = pdfSettings.language === "hin" || pdfSettings.language === "eng"
            ? pdfSettings.language
            : "eng";
        return requested;
    }

    getPdfPreprocessItems(story, language) {
        const items = [];
        const posts = story.posts[language] || {};
        for (const key of Object.keys(posts).sort((a, b) => Number(a) - Number(b))) {
            const template = document.createElement("template");
            template.innerHTML = String(posts[key] || "");
            const images = Array.from(template.content.querySelectorAll("img"))
                .map((image) => this.getPackageImagePathFromElement(image))
                .filter(Boolean);
            items.push({ language, key, images });
        }
        return items;
    }

    replacePackageImagesWithAssetUrls(html, assetUrls) {
        const template = document.createElement("template");
        template.innerHTML = html;
        const images = Array.from(template.content.querySelectorAll("img"));

        for (const image of images) {
            const packagePath = this.getPackageImagePathFromElement(image);
            if (!packagePath) continue;

            const assetUrl = assetUrls.get(packagePath);
            if (assetUrl) image.setAttribute("src", assetUrl);
        }

        return template.innerHTML;
    }

    getPackageImagePathFromElement(image) {
        return this.getPackageImagePath(image.getAttribute("src") || "")
            || this.getPackageImagePath(image.getAttribute("data-original-src") || "");
    }

    getPackageImagePath(source) {
        if (!source || !this.currentFstoryContext) return "";
        if (this.currentFstoryContext.pathByObjectUrl?.has(source)) {
            return this.currentFstoryContext.pathByObjectUrl.get(source);
        }

        const normalized = FetchStoryPackage.normalizePath(source);
        if (this.currentFstoryContext.images?.has(normalized)) return normalized;

        const fileName = normalized.split("/").pop();
        if (!fileName) return "";

        const packagePath = `${this.currentFstoryContext.imagesFolder || "images/"}${fileName}`;
        return this.currentFstoryContext.images?.has(packagePath) ? packagePath : "";
    }

    getFileName(filePath) {
        return String(filePath || "").split("/").pop() || String(filePath || "");
    }

    async getPackageImageDataUrl(packagePath, dataUrlCache) {
        if (dataUrlCache.has(packagePath)) return dataUrlCache.get(packagePath);
        const bytes = this.currentFstoryContext?.images?.get(packagePath);
        if (!bytes) return "";

        const mimeType = this.getMimeTypeForPath(packagePath);
        const blob = new Blob([bytes], { type: mimeType });
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("Image conversion failed"));
            reader.readAsDataURL(blob);
        });
        dataUrlCache.set(packagePath, dataUrl);
        return dataUrl;
    }

    getMimeTypeForPath(packagePath) {
        const ext = String(packagePath || "").split(".").pop().toLowerCase();
        const mimeTypes = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
            avif: "image/avif",
        };
        return mimeTypes[ext] || "application/octet-stream";
    }

    fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, {
            ...options,
            signal: controller.signal,
        }).finally(() => window.clearTimeout(timeout));
    }

    createClientJobId() {
        if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");

        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    }

    async downloadSelectedSectionTxt() {
        if (!this.storyData) return;

        const language = this.getEffectivePdfLanguage(this.getPdfSettings());
        const story = FetchStoryPackage.normalizeStoryLanguages(this.cloneStoryForExport());
        const posts = story.posts[language] || {};
        const keys = Object.keys(posts).sort((a, b) => Number(a) - Number(b));
        const label = language === "hin" ? "Hindi" : "English";

        if (!keys.length) {
            const message = `${label} section empty hai. TXT download ke liye pehle ${label} section me content add/translate kare.`;
            this.updateTxtProgress({ status: "failed", progress: 0, currentPage: 0, totalPages: 0, message });
            window.alert(message);
            return;
        }

        this.setTxtControls({ running: true });
        this.updateTxtProgress({
            status: "preparing",
            progress: 0,
            currentPage: 0,
            totalPages: keys.length,
            message: `Preparing ${label} TXT`,
        });

        try {
            const lines = [
                this.getStoryName(),
                this.getWriterName() ? `Writer: ${this.getWriterName()}` : "",
                this.getStoryUrl() ? `Source: ${this.getStoryUrl()}` : "",
                `Language: ${label}`,
                "",
            ].filter((line, index) => index < 1 || line);

            for (let index = 0; index < keys.length; index++) {
                const key = keys[index];
                const text = this.htmlToPlainText(posts[key]);
                lines.push(`Part ${key}`);
                lines.push("");
                if (text) lines.push(text);
                lines.push("");

                const progress = Math.round(((index + 1) / keys.length) * 100);
                this.updateTxtProgress({
                    status: "preparing",
                    progress,
                    currentPage: index + 1,
                    totalPages: keys.length,
                    message: `Processing ${label} post ${index + 1}/${keys.length}`,
                });
                if ((index + 1) % 10 === 0) await this.waitForRenderFrames(1);
            }

            const blob = new Blob([lines.join("\n").replace(/\n{4,}/g, "\n\n\n")], {
                type: "text/plain;charset=utf-8",
            });
            const fileName = `${this.slugifyFileName(this.getStoryName())}-${language}.txt`;
            this.downloadBlob(blob, fileName);
            this.updateTxtProgress({
                status: "completed",
                progress: 100,
                currentPage: keys.length,
                totalPages: keys.length,
                message: `TXT ready: ${fileName}`,
            });
        } catch (err) {
            this.updateTxtProgress({
                status: "failed",
                progress: 0,
                currentPage: 0,
                totalPages: keys.length,
                message: err.message || "TXT download failed.",
            });
        } finally {
            this.setTxtControls({ running: false });
        }
    }

    htmlToPlainText(html) {
        const template = document.createElement("template");
        template.innerHTML = String(html || "");
        template.content.querySelectorAll("script, style, img, svg, picture, source, noscript").forEach((element) => {
            element.remove();
        });
        template.content.querySelectorAll("br").forEach((element) => {
            element.replaceWith(document.createTextNode("\n"));
        });
        template.content.querySelectorAll("p, div, section, article, blockquote, li, h1, h2, h3, h4, h5, h6").forEach((element) => {
            element.appendChild(document.createTextNode("\n"));
        });
        return (template.content.textContent || "")
            .replace(/\r/g, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/[ \t]{2,}/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    cloneStoryForExport() {
        return JSON.parse(JSON.stringify(this.storyData || {}));
    }

    downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    slugifyFileName(value) {
        return String(value || "story")
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80) || "story";
    }

    updateTxtProgress(job) {
        const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
        const currentPage = Number(job.currentPage || 0);
        const totalPages = Number(job.totalPages || 0);
        const message = job.error || job.message || job.status || "TXT idle";

        if (this.txtProgressBar) this.txtProgressBar.value = progress;
        if (this.txtProgressPercent) this.txtProgressPercent.textContent = `${Math.round(progress)}%`;
        if (this.txtProgressLabel) this.txtProgressLabel.textContent = message;
        if (this.txtPageStatus) this.txtPageStatus.textContent = `Post ${currentPage} / ${totalPages}`;
    }

    setTxtControls({ running }) {
        if (this.txtDownloadBtn) this.txtDownloadBtn.disabled = running || !this.storyData || !!this.activePdfJobId;
    }

    updatePdfProgress(job) {
        const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
        const currentPage = Number(job.currentPage || 0);
        const totalPages = Number(job.totalPages || this.pageKeys.length || 0);
        const message = job.error || job.message || job.status || "Idle";

        if (this.pdfProgressBar) this.pdfProgressBar.value = progress;
        if (this.pdfProgressPercent) this.pdfProgressPercent.textContent = `${Math.round(progress)}%`;
        if (this.pdfProgressLabel) this.pdfProgressLabel.textContent = message;
        if (this.pdfPageStatus) this.pdfPageStatus.textContent = `Page ${currentPage} / ${totalPages}`;

        if (this.pdfDownloadLink) {
            const isReady = job.status === "completed" && job.downloadUrl;
            this.pdfDownloadLink.classList.toggle("hide", !isReady);
            if (isReady) this.pdfDownloadLink.href = job.downloadUrl;
        }
    }

    setPdfControls({ running }) {
        if (this.pdfStartBtn) this.pdfStartBtn.disabled = running || !this.storyData;
        if (this.pdfStopBtn) this.pdfStopBtn.disabled = !running;
        this.setTxtControls({ running });
        [
            this.pdfPageSizeSelect,
            this.pdfOrientationSelect,
            this.pdfMarginSelect,
            this.pdfLanguageSelect,
            this.pdfIncludeImagesInput,
        ].forEach((control) => {
            if (control) control.disabled = running;
        });
    }

    clearPdfPollTimer() {
        if (this.pdfPollTimer) {
            window.clearTimeout(this.pdfPollTimer);
            this.pdfPollTimer = null;
        }
    }

    async prepareStoryForPrint(batchSize = 12) {
        const total = this.pageKeys.length;

        while (this.keyIndex < total) {
            const batchEnd = Math.min(total, this.keyIndex + batchSize);
            const fragment = document.createDocumentFragment();

            while (this.keyIndex < batchEnd) {
                const actualPageNum = this.pageKeys[this.keyIndex];
                fragment.appendChild(this.createStoryPartElement(actualPageNum));
                this.keyIndex++;
            }

            this.contentArea.appendChild(fragment);
            this.updateReadProgress();
            this.statusDiv.textContent = `Preparing PDF… ${this.keyIndex}/${total} parts`;
            this.printBtn.textContent = `Preparing ${this.keyIndex}/${total}`;
            await this.waitForRenderFrames(1);
        }

        if (this.loadAllBtn) this.loadAllBtn.style.display = "none";
    }

    createStoryPartElement(actualPageNum) {
        const currentPosts = this.storyData.posts?.[this.currentLang] || {};
        const pageHtml = currentPosts[actualPageNum] || "";
        const isHtmlEmpty = !pageHtml || pageHtml.replace(/<[^>]*>/g, "").trim() === "";
        const pageDiv = document.createElement("div");
        pageDiv.className = "story-page";
        pageDiv.setAttribute("data-page-num", actualPageNum);

        if (isHtmlEmpty) {
            pageDiv.innerHTML = `<p style="color: #999; font-style: italic; text-align: center;">[Part ${actualPageNum} Content Not Available in ${this.currentLang === "eng" ? "English" : "Hindi"}]</p>`;
        } else {
            const template = document.createElement("template");
            template.innerHTML = pageHtml;
            pageDiv.appendChild(template.content.cloneNode(true));
        }

        return pageDiv;
    }

    async waitForPrintAssets() {
        this.statusDiv.textContent = "Preparing PDF… loading fonts and images";

        if (document.fonts?.ready) {
            await document.fonts.ready;
        }

        const images = Array.from(this.contentArea.querySelectorAll("img"));
        let completed = 0;
        const total = images.length;

        await Promise.all(images.map(async (image) => {
            try {
                if (image.complete) {
                    if (typeof image.decode === "function") await image.decode();
                } else {
                    await Promise.race([
                        new Promise((resolve) => {
                            image.addEventListener("load", resolve, { once: true });
                            image.addEventListener("error", resolve, { once: true });
                        }),
                        new Promise((resolve) => setTimeout(resolve, 10000)),
                    ]);
                    if (image.complete && typeof image.decode === "function") {
                        await image.decode().catch(() => {});
                    }
                }
            } catch (_) {
                // A broken image should not block the rest of the PDF.
            } finally {
                completed++;
                this.statusDiv.textContent = total
                    ? `Preparing PDF… images ${completed}/${total}`
                    : "Preparing PDF… final layout";
            }
        }));
    }

    waitForRenderFrames(count = 1) {
        return new Promise((resolve) => {
            const nextFrame = () => {
                if (count-- <= 0) {
                    resolve();
                    return;
                }
                window.requestAnimationFrame(nextFrame);
            };
            nextFrame();
        });
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
                loadedPages[i].innerHTML = tempDiv.innerHTML;
            } else {
                loadedPages[i].innerHTML = `<p style="color: #999; font-style: italic; text-align: center;">[Part ${pNum} Content Not Available in ${this.currentLang === "eng" ? "English" : "Hindi"}]</p>`;
            }
        }
    }

    // Global Window Level Hooks
    handleWindowScroll() {
        this.updateReadProgress();
        this.saveReaderScroll();
        this.updateReaderChromeVisibility();

        const totalHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const currentScroll = window.innerHeight + (window.scrollY || document.documentElement.scrollTop);
        if (currentScroll >= totalHeight - 800) {
            this.loadNextPage();
        }
    }

    updateReaderChromeVisibility() {
        const currentY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
        const delta = currentY - this.lastChromeScrollY;

        if (currentY < 24) {
            this.setReaderChromeHidden(false);
        } else if (delta > 10 && currentY > 90) {
            this.setReaderChromeHidden(true);
        } else if (delta < -6) {
            this.setReaderChromeHidden(false);
        }

        this.lastChromeScrollY = currentY;
    }

    setReaderChromeHidden(hidden) {
        if (this.isReaderChromeHidden === hidden) return;
        this.isReaderChromeHidden = hidden;
        document.body.classList.toggle("reader-chrome-hidden", hidden);
    }

    handleWindowBeforeUnload() {
        this.saveReaderScroll(true);
        FetchStoryPackage.dispose(this.currentFstoryContext);
    }

    handleDocumentOutsideClick(e) {
        const openPanel = this.toolPanels.find((panel) => panel.classList.contains("is-open"));
        if (openPanel && !openPanel.contains(e.target) && !e.target.closest(".tool-rail")) {
            this.closeSidebar();
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
