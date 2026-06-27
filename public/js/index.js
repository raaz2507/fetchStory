import FetchStoryPackage from "./fstory.js?v=9";
import StoryCache from "./storyCache.js?v=3";

export class StoryScraperApp {
    constructor() {
        // configuration constants
        this.CONFIG = {
            CACHE_KEY: "storyScraper:lastStory",
            THEME_KEY: "storyScraper:theme",
            ACTIVE_FETCH_KEY: "storyScraper:activeFetch"
        };

        this.initDOMElements();
        this.initStates();
        this.setupFetchInterceptor();
        this.bindEvents();
        this.initializeApplication();
    }

    /**
     * सभी DOM elements को एक जगह स्टोर करना
     */
    initDOMElements() {
        this.dom = {
            contentDiv: document.getElementById("content"),
            storyTitle: document.querySelector(".storyTitle"),
            progressBar: document.getElementById("progressBar"),
            progressText: document.getElementById("progressText"),
            pageProgressBar: document.getElementById("pageProgressBar"),
            pageProgressText: document.getElementById("pageProgressText"),
            imageProgressBar: document.getElementById("imageProgressBar"),
            imageProgressText: document.getElementById("imageProgressText"),
            overallProgressText: document.getElementById("overallProgressText"),
            statsText: document.getElementById("statsText"),
            storyMetaArea: document.getElementById("storyMetaArea"),
            stickyStatusLabel: document.getElementById("stickyStatusLabel"),
            stickyStatusDetail: document.getElementById("stickyStatusDetail"),
            stickyProgressBar: document.getElementById("stickyProgressBar"),
            jobStatusPill: document.getElementById("jobStatusPill"),
            jobStoryName: document.getElementById("jobStoryName"),
            jobPostsCount: document.getElementById("jobPostsCount"),
            jobImagesCount: document.getElementById("jobImagesCount"),
            jobDownloadsCount: document.getElementById("jobDownloadsCount"),
            statusTimeline: document.getElementById("statusTimeline"),
            warningPanel: document.getElementById("warningPanel"),
            warningSummary: document.getElementById("warningSummary"),
            warningList: document.getElementById("warningList"),
            contentArea: document.querySelector(".contentArea"),
            showAllPostsBtn: document.getElementById("showAllPostsBtn"),
            showFirstPostsBtn: document.getElementById("showFirstPostsBtn"),
            togglePreviewImages: document.getElementById("togglePreviewImages"),
            postSearchInput: document.getElementById("postSearchInput"),
            scrollLatestBtn: document.getElementById("scrollLatestBtn"),
            statusHeader: document.querySelector(".statusHeader"),
            controlPanel: document.getElementById("controlPanel"),
            controlPanelToggle: document.getElementById("controlPanelToggle"),
            summaryPanel: document.getElementById("summaryPanel"),
            summaryPanelToggle: document.getElementById("summaryPanelToggle"),
            panelBackdrop: document.getElementById("panelBackdrop"),
            panelCloseButtons: document.querySelectorAll("[data-close-panel]"),
            fetchBtn: document.getElementById("fetchBtn"),
            fetchDeletedBtn: document.getElementById("fetchDeletedBtn"),
            cancelFetchBtn: document.getElementById("cancelFetchBtn"),
            insertFstoryBtn: document.getElementById("insertFstoryBtn"),
            fstoryUploadInput: document.getElementById("fstoryUploadInput"),
            downloadFstoryBtn: document.getElementById("downloadFstoryBtn"),
            clearFstoryBtn: document.getElementById("clearFstoryBtn"),
            processUploadedImagesBtn: document.getElementById("processUploadedImagesBtn"),
            logoutBtn: document.getElementById("logoutBtn"),
            themeSelect: document.getElementById("themeSelect"),
            appendFromJson: document.getElementById("appendFromJson"),
            urlInput: document.getElementById("urlInput"),
            authorName: document.getElementById("authorName"),
            startPage: document.getElementById("startPage"),
            endPage: document.getElementById("endPage"),
            loadImages: document.getElementById("loadImages"),
            imageConcurrency: document.getElementById("imageConcurrency"),
            imageRetries: document.getElementById("imageRetries"),
            getMetaBtn: document.getElementById("getMeta"),
            loadFromCacheBtn: document.getElementById("loadFromCache"),
            clearCacheBtn: document.getElementById("clearCache"),
            openReaderBtn: document.getElementById("openReaderBtn")
        };
    }

    /**
     * स्टेट वेरिएबल्स को इनिशियलाइज करना
     */
    initStates() {
        this.activeEventSource = null;
        this.currentStoryMeta = {};
        this.currentStoryData = null;
        this.currentStoryJobId = "";
        this.fetchStartedAt = null;
        this.lastScrollY = window.scrollY || 0;
        this.accumulatedScrollUp = 0;
        this.tickingHeaderVisibility = false;
        this.previewMode = "all";
        this.warningItems = [];
        this.activeOperation = "";
        this.currentFstoryContext = null;

        // Scroll & Pagination States
        this.currentPage = 1;
        this.isLoadingPages = false;
        this.hasMorePages = true;
        this.allowTempPageLoading = false;
    }

    /**
     * global fetch इंटरसेप्टर सेटअप
     */
    setupFetchInterceptor() {
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

    /**
     * एप्लीकेशन का डिफ़ॉल्ट इनिशियल सेटअप लोड करना
     */
    async initializeApplication() {
        this.applyTheme(localStorage.getItem(this.CONFIG.THEME_KEY) || "light");
        const resumed = await this.restoreInterruptedFetch();
        if (!resumed) await this.restoreFromCache(false);
        this.resetWarnings();
        this.updateEmptyState();
        this.updateJobCard();
        
        window.addEventListener("beforeunload", () => {
            FetchStoryPackage.dispose(this.currentFstoryContext);
        });
    }

    /**
     * सभी इवेंट लिसनर्स को बाइंड करना
     */
    bindEvents() {
        // Theme Select
        if (this.dom.themeSelect) {
            this.dom.themeSelect.addEventListener("change", () => this.applyTheme(this.dom.themeSelect.value));
        }

        // Preview Filter Buttons
        if (this.dom.showAllPostsBtn) {
            this.dom.showAllPostsBtn.addEventListener("click", () => {
                this.previewMode = "all";
                this.updatePreviewToolbarState();
                this.applyPreviewFilters();
            });
        }
        if (this.dom.showFirstPostsBtn) {
            this.dom.showFirstPostsBtn.addEventListener("click", () => {
                this.previewMode = "first";
                this.updatePreviewToolbarState();
                this.applyPreviewFilters();
            });
        }

        // Filters Inputs
        if (this.dom.togglePreviewImages) this.dom.togglePreviewImages.addEventListener("change", () => this.applyPreviewFilters());
        if (this.dom.postSearchInput) this.dom.postSearchInput.addEventListener("input", () => this.applyPreviewFilters());
        if (this.dom.scrollLatestBtn) this.dom.scrollLatestBtn.addEventListener("click", () => this.scrollToLatestPost());

        // Control Panel Toggles
        if (this.dom.controlPanelToggle && this.dom.controlPanel) {
            this.dom.controlPanelToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleControlPanel();
            });
            this.dom.controlPanel.addEventListener("click", (e) => e.stopPropagation());
            document.addEventListener("click", () => this.closeControlPanel());
            document.addEventListener("keydown", (e) => e.key === "Escape" && this.closeControlPanel());
            window.addEventListener("resize", () => window.innerWidth > 820 && this.closeControlPanel());
        }

        // Summary Panel Toggles
        if (this.dom.summaryPanelToggle && this.dom.summaryPanel) {
            this.dom.summaryPanelToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleSummaryPanel();
            });
            this.dom.summaryPanel.addEventListener("click", (e) => e.stopPropagation());
            document.addEventListener("click", () => this.closeSummaryPanel());
            document.addEventListener("keydown", (e) => e.key === "Escape" && this.closeSummaryPanel());
            window.addEventListener("resize", () => window.innerWidth > 820 && this.closeSummaryPanel());
        }

        if (this.dom.panelCloseButtons) {
            this.dom.panelCloseButtons.forEach((button) => {
                button.addEventListener("click", () => {
                    if (button.dataset.closePanel === "status") this.closeSummaryPanel();
                    else this.closeControlPanel();
                });
            });
        }
        if (this.dom.panelBackdrop) {
            this.dom.panelBackdrop.addEventListener("click", () => {
                this.closeControlPanel();
                this.closeSummaryPanel();
            });
        }

        // Auth & Action Buttons
        if (this.dom.logoutBtn) this.dom.logoutBtn.addEventListener("click", () => this.logoutPublicSession());
        // Fstory Package Handlers
        if (this.dom.insertFstoryBtn && this.dom.fstoryUploadInput) {
            this.dom.insertFstoryBtn.addEventListener("click", () => this.dom.fstoryUploadInput.click());
            this.dom.fstoryUploadInput.addEventListener("change", () => this.handleFstoryUpload());
        }
        if (this.dom.downloadFstoryBtn) this.dom.downloadFstoryBtn.addEventListener("click", () => this.handleFstoryDownload());
        if (this.dom.clearFstoryBtn) this.dom.clearFstoryBtn.addEventListener("click", () => this.handleFstoryClear());

        // Process Buttons
        if (this.dom.processUploadedImagesBtn) this.dom.processUploadedImagesBtn.addEventListener("click", () => this.processUploadedImages());
        if (this.dom.getMetaBtn) this.dom.getMetaBtn.addEventListener("click", () => this.getStoryMeta());
        if (this.dom.fetchBtn) this.dom.fetchBtn.addEventListener("click", () => this.fetchStoryStream());
        if (this.dom.fetchDeletedBtn) this.dom.fetchDeletedBtn.addEventListener("click", () => this.fetchStoryStream({ deletedMode: true }));
        if (this.dom.cancelFetchBtn) this.dom.cancelFetchBtn.addEventListener("click", () => this.cancelActiveOperation());
        
        // Cache & Download Buttons
        if (this.dom.loadFromCacheBtn) this.dom.loadFromCacheBtn.addEventListener("click", () => this.restoreFromCache(true));
        if (this.dom.clearCacheBtn) this.dom.clearCacheBtn.addEventListener("click", () => this.clearApplicationCache());
        if (this.dom.openReaderBtn) this.dom.openReaderBtn.addEventListener("click", () => window.open("/reader-translator", "_blank", "noopener"));

        // Window Scroll
        window.addEventListener('scroll', () => this.handleWindowScroll());
    }

    /* =========================================================================
       CORE METHOD IMPLEMENTATIONS
       ========================================================================= */

    applyTheme(theme) {
        const nextTheme = theme === "dark" ? "dark" : "light";
        document.documentElement.dataset.theme = nextTheme;
        if (this.dom.themeSelect) this.dom.themeSelect.value = nextTheme;
        localStorage.setItem(this.CONFIG.THEME_KEY, nextTheme);
    }

    toggleControlPanel() {
        if (!this.dom.controlPanel) return;
        const isOpen = this.dom.controlPanel.classList.toggle("is-open");
        if (isOpen) this.closeSummaryPanel();
        if (this.dom.controlPanelToggle) {
            this.dom.controlPanelToggle.setAttribute("aria-expanded", String(isOpen));
            this.dom.controlPanelToggle.textContent = isOpen ? "Close" : "Controls";
        }
        this.syncPanelBackdrop();
    }

    closeControlPanel() {
        if (!this.dom.controlPanel || !this.dom.controlPanel.classList.contains("is-open")) return;
        this.dom.controlPanel.classList.remove("is-open");
        if (this.dom.controlPanelToggle) {
            this.dom.controlPanelToggle.setAttribute("aria-expanded", "false");
            this.dom.controlPanelToggle.textContent = "Controls";
        }
        this.syncPanelBackdrop();
    }

    toggleSummaryPanel() {
        if (!this.dom.summaryPanel) return;
        const isOpen = this.dom.summaryPanel.classList.toggle("is-open");
        if (isOpen) this.closeControlPanel();
        if (this.dom.summaryPanelToggle) {
            this.dom.summaryPanelToggle.setAttribute("aria-expanded", String(isOpen));
            this.dom.summaryPanelToggle.textContent = isOpen ? "Close" : "Status";
        }
        this.syncPanelBackdrop();
    }

    closeSummaryPanel() {
        if (!this.dom.summaryPanel || !this.dom.summaryPanel.classList.contains("is-open")) return;
        this.dom.summaryPanel.classList.remove("is-open");
        if (this.dom.summaryPanelToggle) {
            this.dom.summaryPanelToggle.setAttribute("aria-expanded", "false");
            this.dom.summaryPanelToggle.textContent = "Status";
        }
        this.syncPanelBackdrop();
    }

    syncPanelBackdrop() {
        if (!this.dom.panelBackdrop) return;
        const shouldShow = window.innerWidth <= 820 && Boolean(
            this.dom.controlPanel?.classList.contains("is-open")
            || this.dom.summaryPanel?.classList.contains("is-open")
        );
        this.dom.panelBackdrop.hidden = !shouldShow;
        this.dom.panelBackdrop.classList.toggle("is-visible", shouldShow);
    }

    async handleFstoryUpload() {
        const file = this.dom.fstoryUploadInput.files && this.dom.fstoryUploadInput.files[0];
        if (!file) return;
        let opened = null;
        let packageAccepted = false;

        try {
            this.resetWarnings();
            this.dom.insertFstoryBtn.disabled = true;
            this.setJobStatus("Opening package", "active");
            this.setStatus("Opening .fstory", "Reading manifest, story JSON, and images locally...");
            this.setProgressBars(0, 0, 0, "0%", "Waiting", "0 / 0");
            opened = await FetchStoryPackage.open(file, {
                onProgress: (progress) => this.updateFstoryOpenProgress(progress),
            });
            const result = await this.uploadFstoryJsonWithProgress(opened.rawStoryData, opened.context.imageIndex);

            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = opened.context;
            packageAccepted = true;
            this.currentStoryJobId = result.jobId || "";
            this.applyStoryData(result.storyData);
            await StoryCache.saveFstoryPackage(opened.rawStoryData, opened.context, {
                packageName: file.name,
            });
            this.setJobStatus("Package loaded", "complete");
            this.setProgressBars(100, 100, 100, "100%", "Ready", `${opened.context.images.size} / ${opened.context.images.size}`);
            this.setStatus(".fstory opened", `${opened.manifest.contentFile} loaded. ZIP and images stayed in the browser.`);
        } catch (err) {
            console.error(err);
            if (opened && !packageAccepted) FetchStoryPackage.dispose(opened.context);
            this.setJobStatus("Error", "warning");
            this.setStatus("Package open failed", err.message || "Invalid .fstory package");
        } finally {
            this.dom.insertFstoryBtn.disabled = false;
            this.dom.fstoryUploadInput.value = "";
        }
    }

    updateFstoryOpenProgress(progress) {
        const overall = progress.overallPercent || 0;
        const stage = progress.stagePercent || 0;
        const workflowStage = progress.stage === "images"
            ? "downloading"
            : ["preparing", "ready"].includes(progress.stage)
                ? "updating"
                : "scanning";
        const imageText = progress.total
            ? `${progress.current} / ${progress.total}`
            : progress.stage === "images" ? "0 / 0" : "—";

        this.setWorkflowStep(workflowStage);
        this.setProgressBars(
            overall,
            stage,
            progress.stage === "images" ? stage : 0,
            `${overall}%`,
            progress.label || "Opening package",
            imageText,
        );
        this.setStatus(progress.label || "Opening .fstory", progress.detail || "");
    }

    uploadFstoryJsonWithProgress(storyData, imageIndex) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/story/upload-json");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.withCredentials = true;

            xhr.upload.onprogress = (event) => {
                const percent = event.lengthComputable
                    ? Math.round((event.loaded / event.total) * 100)
                    : 0;
                const overall = 94 + Math.round(percent * 0.05);
                this.setProgressBars(overall, percent, 100, `${overall}%`, `Uploading JSON · ${percent}%`, "Complete");
                this.setStatus("Saving story", event.lengthComputable
                    ? `${FetchStoryPackage.formatFileSize(event.loaded)} / ${FetchStoryPackage.formatFileSize(event.total)}`
                    : "Uploading story JSON");
            };

            xhr.onload = () => {
                let result;
                try {
                    result = JSON.parse(xhr.responseText || "{}");
                } catch (_) {
                    reject(new Error("Server returned an invalid response"));
                    return;
                }

                if (xhr.status < 200 || xhr.status >= 300 || result.error) {
                    reject(new Error(result.error || "Story JSON could not be prepared"));
                    return;
                }
                resolve(result);
            };
            xhr.onerror = () => reject(new Error("Story JSON upload failed"));
            xhr.send(JSON.stringify({ storyData, imageIndex }));
        });
    }

    async handleFstoryDownload() {
        if (!this.currentStoryData) {
            this.setStatus("No story ready", "Fetch a story or open an .fstory first.");
            return;
        }

        try {
            this.dom.downloadFstoryBtn.disabled = true;
            this.setJobStatus("Packaging", "active");
            if (this.currentFstoryContext) {
                this.setStatus("Building .fstory", "Merging original package images with newly fetched images locally...");
                this.setWorkflowStep("updating");
                this.setProgressBars(20, 100, 100, "20%", "Packaging", "Ready");
                const result = await FetchStoryPackage.build(this.currentStoryData, this.currentFstoryContext);
                this.setProgressBars(85, 100, 100, "85%", "Package built", "Ready");
                FetchStoryPackage.download(result.blob, result.fileName);
            } else {
                if (!this.currentStoryJobId) throw new Error("Server story job is not available");
                this.setStatus("Building .fstory", "Server is packaging fetched JSON and images...");
                await this.downloadServerFile(
                    "/api/story/download-fstory",
                    `${this.sanitizeFileName(this.dom.storyTitle.textContent.trim() || "story")}.fstory`,
                );
            }
            this.setJobStatus("Ready", "complete");
            this.setStatus(".fstory ready", "FetchStory package downloaded.");
        } catch (err) {
            console.error(err);
            this.setJobStatus("Error", "warning");
            this.setStatus("Package download failed", err.message || "Could not create .fstory");
        } finally {
            this.dom.downloadFstoryBtn.disabled = false;
        }
    }

    handleFstoryClear() {
        if (!this.currentFstoryContext) {
            this.setStatus("No package loaded", "There is no local .fstory package to clear.");
            return;
        }
        this.clearCurrentPackage(true);
        StoryCache.clear().catch((err) => {
            console.warn("Package cache clear failed:", err.message);
        });
        this.setStatus("Package cleared", "Local package JSON and image memory were released.");
    }

    processUploadedImages() {
        try {
            if (!this.currentStoryJobId) {
                this.setStatus("No story ready", "Fetch a story or open an .fstory before adding images.");
                return;
            }

            this.closeActiveStream();
            this.resetWarnings();
            this.setWorkflowStep("scanning");
            this.setJobStatus("Processing", "active");
            this.setStatus("Processing JSON images", "Scanning posts and image links...");
            this.setProgressBars(0, 0, 0, "0%", "0%", "0%");
            this.dom.processUploadedImagesBtn.disabled = true;
            this.dom.processUploadedImagesBtn.textContent = "Adding Images...";
            this.activeOperation = "images";
            this.setFetchingState(true);

            this.activeEventSource = new EventSource(
                `/api/story/process-uploaded-images-stream?jobId=${encodeURIComponent(this.currentStoryJobId)}`,
                { withCredentials: true }
            );

            this.activeEventSource.onerror = (err) => {
                console.error("Uploaded image SSE error", err);
                this.closeActiveStream();
                this.dom.processUploadedImagesBtn.disabled = false;
                this.dom.processUploadedImagesBtn.textContent = "Add / Update Images";
                this.activeOperation = "";
                this.setFetchingState(false);
                this.setJobStatus("Error", "warning");
                this.setStatus("Connection error", "Image processing connection failed.");
            };

            this.activeEventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.jobId) this.currentStoryJobId = data.jobId;

                if (data.error) {
                    this.closeActiveStream();
                    this.dom.processUploadedImagesBtn.disabled = false;
                    this.dom.processUploadedImagesBtn.textContent = "Add / Update Images";
                    this.activeOperation = "";
                    this.setFetchingState(false);
                    this.setJobStatus("Error", "warning");
                    this.setStatus("Image processing failed", data.error);
                    return;
                }

                if (data.done) {
                    this.closeActiveStream();
                    this.dom.processUploadedImagesBtn.disabled = false;
                    this.dom.processUploadedImagesBtn.textContent = "Update Images";
                    this.activeOperation = "";
                    this.setFetchingState(false);
                    this.setWorkflowStep("ready");
                    this.applyStoryData(this.prepareProcessedStoryData(data.storyData, data.imageIndex));
                    const stats = data.stats || {};
                    this.updateWarningsFromStats(stats);
                    this.setJobStatus("Ready", "complete");
                    const indexStats = stats.index || {};
                    this.setStatus(
                        "Images processed",
                        `${stats.downloadedImages || 0} downloaded, ${stats.duplicateImages || 0} duplicates, ${indexStats.available || 0} available, ${stats.skippedImages || 0} failed`,
                    );
                    this.saveCache();
                    return;
                }

                const overallPercent = data.overallPercent ?? 0;
                const pagePercent = data.pagePercent ?? 0;
                const imagePercent = data.imagePercent ?? 0;

                const imageText = data.totalImagesOnCurrentPost
                    ? `${data.currentImageIndex || 0}/${data.totalImagesOnCurrentPost} | ${imagePercent}%`
                    : "No images";
                const overallText = data.totalPosts
                    ? `${data.processedPosts || 0}/${data.totalPosts} posts | ${overallPercent}%`
                    : `${overallPercent}%`;
                const pageText = data.totalImagesOnCurrentPost
                    ? `Post ${data.currentPostKey || "-"} | ${data.currentImageIndex || 0}/${data.totalImagesOnCurrentPost}`
                    : `Post ${data.currentPostKey || "-"} | ${pagePercent}%`;

                this.setProgressBars(overallPercent, pagePercent, imagePercent, overallText, pageText, imageText);
                this.setWorkflowStep(data.totalImages ? "downloading" : "scanning");
                this.setStatus(
                    data.message || "Processing JSON images",
                    `${overallText} · ${data.alreadyAvailable || 0} available · ${data.duplicateImages || 0} duplicates`,
                );
                this.updateWarningsFromStats(data);
                this.updateStats({
                    matchedPosts: data.processedPosts || 0,
                    downloadedImages: data.downloadedImages || 0,
                    skippedImages: data.skippedImages || 0,
                });
                this.currentStoryMeta = {
                    ...this.currentStoryMeta,
                    lastFetch: new Date().toISOString(),
                    "total-image": data.totalImages || this.currentStoryMeta["total-image"] || 0,
                    "image-downlaods": data.downloadedImages || 0,
                };
                this.updateStoryMeta(this.currentStoryMeta);
            };
        } catch (err) {
            console.error(err);
            this.closeActiveStream();
            this.dom.processUploadedImagesBtn.disabled = false;
            this.dom.processUploadedImagesBtn.textContent = "Process Images";
            this.activeOperation = "";
            this.setFetchingState(false);
            this.setJobStatus("Error", "warning");
            this.setStatus("Image processing failed", err.message || "Image processing failed");
        }
    }

    prepareProcessedStoryData(storyData, imageIndex) {
        if (!this.currentFstoryContext || !this.currentStoryJobId || !imageIndex) return storyData;
        const availablePaths = new Set(
            Object.values(imageIndex.images || {})
                .filter((entry) => entry.status === "available" && entry.path)
                .map((entry) => String(entry.path).replace(/\\/g, "/").replace(/^\.\/+/, "")),
        );
        const prepared = JSON.parse(JSON.stringify(storyData));
        for (const section of ["eng", "hin"]) {
            for (const key of Object.keys(prepared.posts?.[section] || {})) {
                prepared.posts[section][key] = String(prepared.posts[section][key] || "").replace(
                    /\bsrc=(["'])(?:\.\/)?(images\/[^"']+)\1/gi,
                    (match, quote, imagePath) => availablePaths.has(imagePath)
                        ? `src=${quote}/temp/jobs/${this.currentStoryJobId}/${imagePath}${quote}`
                        : match,
                );
            }
        }
        return prepared;
    }

    async getStoryMeta() {
        const url = this.dom.urlInput.value.trim();
        if (!url) {
            this.setStatus("URL missing", "Paste a story URL first.");
            return;
        }

        this.setJobStatus("Checking", "active");
        this.setStatus("Getting meta", "Reading title, author and page count...");

        try {
            const response = await fetch(`/api/story/meta?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (!response.ok || data.error) throw new Error(data.error || "Meta fetch failed");

            this.dom.storyTitle.textContent = data.title || "";
            if (data.writerName && !this.dom.authorName.value.trim()) {
                this.dom.authorName.value = data.writerName;
            }
            this.dom.endPage.value = data.totalPages || "";
            this.setJobStatus("Meta ready", "complete");
            this.setStatus("Meta ready", `Total Pages: ${data.totalPages || 1}`);
        } catch (err) {
            console.error(err);
            this.setJobStatus("Error", "warning");
            this.setStatus("Meta fetch failed", err.message || "Meta fetch failed");
        }
    }

    async loadNextPage() {
        if (!this.allowTempPageLoading || this.isLoadingPages || !this.hasMorePages) return;
        if (!this.currentStoryJobId) return;
        this.isLoadingPages = true;

        try {
            const response = await fetch(`/api/story/get-page?page=${this.currentPage}&jobId=${encodeURIComponent(this.currentStoryJobId)}`);
            if (response.status === 404) {
                this.isLoadingPages = false;
                return;
            }

            const data = await response.json();
            if (response.ok && data.html) {
                if (data.storyName && this.dom.storyTitle.textContent === "") {
                    this.dom.storyTitle.textContent = data.storyName;
                }

                let postBlock = document.getElementById(`story-post-${data.page}`);
                if (!postBlock) {
                    postBlock = document.createElement('div');
                    postBlock.id = `story-post-${data.page}`;
                    postBlock.className = "story-page";
                    postBlock.style.padding = "2rem 0";
                    postBlock.style.borderBottom = "1px dashed #ccc";
                    this.dom.contentDiv.appendChild(postBlock);
                }
                
                postBlock.innerHTML = data.html;
                this.currentPage++; 
                this.hasMorePages = data.hasNextPage;

                setTimeout(() => {
                    if (document.body.offsetHeight <= window.innerHeight && this.hasMorePages) {
                        this.loadNextPage();
                    }
                }, 300);
            } else {
                this.hasMorePages = false; 
            }
        } catch (err) {
            console.error("Error loading page:", err);
        } finally {
            this.isLoadingPages = false;
        }
    }

    handleWindowScroll() {
        this.updateStatusHeaderVisibility();
        if (this.activeEventSource) return;

        const totalHeight = document.documentElement.scrollHeight;
        const currentScroll = window.innerHeight + window.scrollY;

        if (currentScroll >= totalHeight - 800) {
            this.loadNextPage();
        }
    }

    updateStatusHeaderVisibility() {
        if ((!this.dom.statusHeader && !this.dom.summaryPanel) || this.tickingHeaderVisibility) return;

        this.tickingHeaderVisibility = true;
        window.requestAnimationFrame(() => {
            const currentY = Math.max(0, window.scrollY || 0);
            const delta = currentY - this.lastScrollY;

            if (currentY < 24) {
                this.showScrollSensitivePanels();
                this.accumulatedScrollUp = 0;
            } else if (delta > 8) {
                this.hideScrollSensitivePanels();
                this.accumulatedScrollUp = 0;
            } else if (delta < 0) {
                this.accumulatedScrollUp += Math.abs(delta);
                if (this.accumulatedScrollUp >= 12) {
                    this.showScrollSensitivePanels();
                }
            }

            this.lastScrollY = currentY;
            this.tickingHeaderVisibility = false;
        });
    }

    hideScrollSensitivePanels() {
        if (this.dom.statusHeader) {
            this.dom.statusHeader.classList.add("is-hidden");
            this.dom.statusHeader.classList.remove("is-visible");
        }
        if (this.dom.summaryPanel) {
            this.dom.summaryPanel.classList.add("is-scroll-hidden");
            this.dom.summaryPanel.classList.remove("is-scroll-visible");
        }
    }

    showScrollSensitivePanels() {
        if (this.dom.statusHeader) {
            this.dom.statusHeader.classList.remove("is-hidden");
            this.dom.statusHeader.classList.add("is-visible");
        }
        if (this.dom.summaryPanel) {
            this.dom.summaryPanel.classList.remove("is-scroll-hidden");
            this.dom.summaryPanel.classList.add("is-scroll-visible");
        }
    }

    fetchStoryStream(options = {}) {
        this.allowTempPageLoading = true;
        const resumeContext = options.resumeContext || null;
        const deletedMode = Boolean(options.deletedMode || resumeContext?.deletedMode);
        const appendFromJson = Boolean(resumeContext) || this.dom.appendFromJson.checked;
        if (!appendFromJson) {
            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = null;
            this.dom.contentDiv.innerHTML = "";
            this.dom.storyTitle.textContent = "";
            this.currentStoryData = null;
            this.currentStoryJobId = "";
        }
        this.resetWarnings();
        this.setWorkflowStep("scanning");
        this.setProgressBars(0, 0, 0, "0%", "0%", "0%");
        this.setJobStatus(deletedMode ? "Deleted Fetch" : "Fetching", "active");
        this.setStatus(
            deletedMode ? "Starting deleted-story fetch" : "Starting fetch",
            deletedMode ? "Reading expandable quoted posts from the selected pages..." : "Preparing source and page range..."
        );
        
        const existingPostCount = this.dom.contentDiv.querySelectorAll(".story-page").length;
        this.updateStats({ matchedPosts: appendFromJson ? existingPostCount : 0, downloadedImages: 0, skippedImages: 0 });

        this.currentPage = appendFromJson ? existingPostCount + 1 : 1;
        this.isLoadingPages = false;
        this.hasMorePages = true;
        this.fetchStartedAt = new Date();
        this.currentStoryMeta = {
            ...(appendFromJson ? this.currentStoryMeta : {}),
            lastFetch: this.fetchStartedAt.toISOString(),
            "total-image": appendFromJson ? this.currentStoryMeta["total-image"] || 0 : 0,
            "image-downlaods": appendFromJson ? this.currentStoryMeta["image-downlaods"] || 0 : 0,
            "start-time": this.fetchStartedAt.toISOString(),
            "end time": "",
            "duration taken": "",
            "last-page-no": appendFromJson ? this.currentStoryMeta["last-page-no"] || 0 : 0,
        };
        this.updateStoryMeta(this.currentStoryMeta);

        const url = resumeContext?.url || this.dom.urlInput.value.trim();
        const author = resumeContext?.author || this.dom.authorName.value.trim();
        const startPage = resumeContext?.startPage || this.dom.startPage.value;
        const endPage = resumeContext?.endPage || this.dom.endPage.value;
        const loadImages = resumeContext ? resumeContext.loadImages !== false : this.dom.loadImages.checked;
        const imageConcurrency = resumeContext?.imageConcurrency || this.getClampedInputValue(this.dom.imageConcurrency, 3, 1, 10);
        const imageRetries = resumeContext?.imageRetries || this.getClampedInputValue(this.dom.imageRetries, 3, 1, 5);
        const jobId = resumeContext?.jobId || this.currentStoryJobId || this.createClientJobId();
        this.currentStoryJobId = jobId;
        this.dom.appendFromJson.checked = appendFromJson;

        const params = new URLSearchParams({ url, author });
        if (startPage) params.set("startPage", startPage);
        if (endPage) params.set("endPage", endPage);
        params.set("loadImages", loadImages ? "1" : "0");
        params.set("imageConcurrency", String(imageConcurrency));
        params.set("imageRetries", String(imageRetries));
        params.set("append", appendFromJson ? "1" : "0");
        params.set("jobId", jobId);
        if (deletedMode) params.set("mode", "deleted");

        this.saveActiveFetch({
            jobId,
            url,
            author,
            startPage,
            endPage,
            loadImages,
            imageConcurrency,
            imageRetries,
            deletedMode,
            startedAt: resumeContext?.startedAt || this.fetchStartedAt.toISOString(),
        });

        this.closeActiveStream();
        this.activeOperation = "fetch";
        this.setFetchingState(true);
        if (resumeContext) {
            this.setStatus("Resuming fetch", `Continuing after page ${this.currentStoryMeta["last-page-no"] || 0}...`);
        }

        this.activeEventSource = new EventSource(`/api/story/stream?${params.toString()}`, { withCredentials: true });

        this.activeEventSource.onerror = (err) => {
            console.error("SSE error", err);
            this.closeActiveStream();
            this.setJobStatus("Error", "warning");
            this.setStatus("Connection error", "Live fetch connection failed.");
            this.activeOperation = "";
            this.setFetchingState(false);
        };

        this.activeEventSource.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            if (data.error) {
                if (data.jobId) this.currentStoryJobId = data.jobId;
                this.closeActiveStream();
                this.setJobStatus("Error", "warning");
                this.setStatus("Fetch failed", data.error);
                this.activeOperation = "";
                this.setFetchingState(false);
                if (data.error !== "Fetch cancelled") this.clearActiveFetch();
                return;
            }

            if (data.done) {
                if (data.jobId) this.currentStoryJobId = data.jobId;
                this.closeActiveStream();
                this.allowTempPageLoading = true;
                this.setWorkflowStep("ready");
                this.setProgressBars(100, 100, 100, "100%", "100%", "100%");
                this.setJobStatus("Ready", "complete");
                this.setStatus(
                    deletedMode ? "Deleted-story fetch complete" : "Fetch complete",
                    "Story JSON and preview are ready."
                );
                this.activeOperation = "";
                this.setFetchingState(false);
                this.clearActiveFetch();
                
                const totalLoadedPages = this.dom.contentDiv.querySelectorAll('.story-page').length;
                this.currentPage = totalLoadedPages + 1;
                this.hasMorePages = totalLoadedPages > 0;

                try {
                    const finalStory = await this.loadJobStory(this.currentStoryJobId);
                    this.applyStoryData(finalStory, {
                        enableAppend: this.dom.appendFromJson.checked,
                        jobId: this.currentStoryJobId,
                    });
                } catch (err) {
                    console.warn("Final story reload failed:", err.message);
                    if (data.meta) {
                        this.finishCurrentStoryMeta();
                        this.currentStoryMeta = { ...this.currentStoryMeta, ...data.meta };
                    } else {
                        this.finishCurrentStoryMeta();
                    }
                }
                this.updateStoryMeta(this.currentStoryMeta);
                this.saveCache();
                return;
            }

            const overallPercent = data.overallPercent ?? data.percent ?? 0;
            if (data.jobId) this.currentStoryJobId = data.jobId;
            const pagePercent = data.pagePercent ?? 0;
            const imagePercent = data.imagePercent ?? 0;

            const pageText = `Page ${data.currentPage || 1}/${data.totalPages || 1} | ${pagePercent}%`;
            const imageText = data.imagesEnabled === false
                ? "Disabled"
                : data.totalImagesOnCurrentPost
                ? `${data.currentImageIndex || 0}/${data.totalImagesOnCurrentPost} | ${imagePercent}%`
                : "No images";
            const overallText = `Page ${data.currentPage || 1}/${data.totalPages || 1} | ${overallPercent}%`;

            this.setWorkflowStep(data.imagesEnabled === false || !data.totalImagesOnCurrentPost ? "scanning" : "downloading");
            this.setProgressBars(overallPercent, pagePercent, imagePercent, overallText, pageText, imageText);
            this.setStatus("Fetching story", overallText);
                
            this.updateStats(data);
            this.currentStoryMeta = {
                ...this.currentStoryMeta,
                lastFetch: new Date().toISOString(),
                "total-image": data.totalImages || this.currentStoryMeta["total-image"] || 0,
                "image-downlaods": data.downloadedImages || this.currentStoryMeta["image-downlaods"] || 0,
                "last-page-no": data.currentPage || 0,
            };
            this.updateStoryMeta(this.currentStoryMeta);

            if (data.title && this.dom.storyTitle.textContent === "") {
                this.dom.storyTitle.textContent = data.title;
            }

            const targetPostId = data.currentPostNum || data.matchedPosts;

            if (data.html && targetPostId) {
                let existingPost = document.getElementById(`story-post-${targetPostId}`);
                if (!existingPost) {
                    existingPost = document.createElement('div');
                    existingPost.id = `story-post-${targetPostId}`;
                    existingPost.className = "story-page";
                    existingPost.style.padding = "2rem 0";
                    existingPost.style.borderBottom = "1px dashed #ccc";
                    this.dom.contentDiv.appendChild(existingPost);
                    this.currentPage = targetPostId + 1;
                    this.hasMorePages = true; 
                }
                
                existingPost.innerHTML = data.html;
                this.applyPreviewFilters();
                this.updateEmptyState();
            }
            this.saveCache();
        };
    }

    cancelActiveOperation() {
        const cancelledOperation = this.activeOperation;
        this.closeActiveStream();
        this.activeOperation = "";
        this.clearActiveFetch();
        this.setFetchingState(false);
        if (cancelledOperation === "fetch") {
            this.finishCurrentStoryMeta();
            this.updateStoryMeta(this.currentStoryMeta);
        } else if (cancelledOperation === "images") {
            this.dom.processUploadedImagesBtn.disabled = false;
            this.dom.processUploadedImagesBtn.textContent = "Process Images";
        }
        this.saveCache();
        this.setJobStatus("Cancelled", "warning");
        this.setStatus(
            cancelledOperation === "images" ? "Image processing cancelled" : "Fetch cancelled",
            cancelledOperation === "images" ? "Image processing was stopped." : "Current fetch was stopped."
        );
    }

    async restoreFromCache(showMissingMessage) {
        let data = null;
        try {
            data = await this.loadBrowserCache();
        } catch (err) {
            console.warn("IndexedDB cache load failed:", err.message);
            if (showMissingMessage) this.setStatus("Cache load failed", err.message);
            return;
        }

        if (!data) {
            if (showMissingMessage) this.setStatus("No cache found", "There is no saved browser cache yet.");
            return;
        }

        try {
            this.allowTempPageLoading = false;
            this.currentStoryJobId = data.jobId || "";

            if (data.source === "fstory") {
                await this.restoreCachedFstoryPackage(data);
            }

            if (data.storyData) {
                this.applyStoryData(data.storyData, { enableAppend: false, jobId: this.currentStoryJobId });
            } else {
                this.dom.storyTitle.textContent = data.title || "";
                this.dom.contentDiv.innerHTML = data.html || "";
            }

            this.setProgressBars(
                data.percent || 0,
                data.pagePercent || 0,
                data.imagePercent || 0,
                data.overallProgressText || `${data.percent || 0}%`,
                data.pageProgressText || "0%",
                data.imageProgressText || "0%"
            );
            this.setJobStatus("Loaded", "complete");
            this.setStatus("Loaded from cache", showMissingMessage ? "Loaded from cache" : data.progressText || "Loaded from cache");
            this.dom.statsText.textContent = data.statsText || "Posts: 0 | Images: 0 downloaded, 0 skipped";
            if (this.dom.storyMetaArea) {
                this.dom.storyMetaArea.innerHTML = data.storyMetaHtml || this.dom.storyMetaArea.innerHTML;
            }
            
            this.currentPage = this.dom.contentDiv.querySelectorAll('.story-page').length + 1;
            this.hasMorePages = false;
            this.updateJobCard();
            this.updateEmptyState();
            this.applyPreviewFilters();
        } catch (err) {
            console.error(err);
            this.setStatus("Cache load failed", err.message || "Cache load failed");
        }
    }

    async restoreInterruptedFetch() {
        const context = this.loadActiveFetch();
        if (!context?.jobId || !context.url) return false;

        this.currentStoryJobId = context.jobId;
        this.dom.urlInput.value = context.url;
        this.dom.authorName.value = context.author || "";
        this.dom.startPage.value = context.startPage || "";
        this.dom.endPage.value = context.endPage || "";
        this.dom.loadImages.checked = context.loadImages !== false;
        this.dom.appendFromJson.checked = true;
        this.setJobStatus("Recovering", "active");
        this.setStatus("Restoring interrupted fetch", "Loading saved pages from the server...");

        await new Promise((resolve) => setTimeout(resolve, 800));

        try {
            const partialStory = await this.loadJobStory(context.jobId);
            this.applyStoryData(partialStory, {
                enableAppend: true,
                jobId: context.jobId,
            });
            const normalized = this.normalizeStoryData(partialStory);
            const lastPage = normalized["last-page-no"] || 0;
            const totalPage = normalized.totalPage || 0;
            const percent = totalPage ? Math.min(99, Math.round((lastPage / totalPage) * 100)) : 0;

            this.setWorkflowStep("scanning");
            this.setProgressBars(
                percent,
                0,
                0,
                totalPage ? `Page ${lastPage}/${totalPage} | ${percent}%` : `${percent}%`,
                `Page ${lastPage}`,
                context.loadImages === false ? "Disabled" : "Waiting"
            );
            this.setJobStatus("Resuming", "active");
            this.setStatus("Fetch interrupted by refresh", `Saved through page ${lastPage}. Resuming now...`);

            window.setTimeout(() => this.fetchStoryStream({ resumeContext: context }), 250);
            return true;
        } catch (err) {
            console.warn("Interrupted fetch restore failed:", err.message);
            this.clearActiveFetch();
            this.setJobStatus("Interrupted", "warning");
            this.setStatus("Resume unavailable", "The partial server job could not be restored.");
            return false;
        }
    }

    async clearApplicationCache() {
        localStorage.removeItem(this.CONFIG.CACHE_KEY);
        await this.clearBrowserCache();
        this.clearActiveFetch();
        FetchStoryPackage.dispose(this.currentFstoryContext);
        this.currentFstoryContext = null;
        this.allowTempPageLoading = false;
        this.dom.contentDiv.innerHTML = "";
        this.dom.storyTitle.textContent = "";
        this.currentStoryData = null;
        this.currentStoryJobId = "";
        this.currentPage = 1;
        this.hasMorePages = false;
        this.resetWarnings();
        this.setWorkflowStep("uploaded");
        this.setProgressBars(0, 0, 0, "0%", "0%", "0%");
        this.updateStats({ matchedPosts: 0, downloadedImages: 0, skippedImages: 0 });
        this.updateStoryMeta({
            lastFetch: "",
            "total-image": 0,
            "image-downlaods": 0,
            "start-time": "",
            "end time": "",
            "duration taken": "",
            "last-page-no": 0,
        });
        this.setJobStatus("Idle", "");
        this.setStatus("Cache cleared", "Ready for a fresh story.");
        this.updateJobCard();
        this.updateEmptyState();
    }

    async downloadServerFile(endpoint, fallbackName) {
        const title = this.dom.storyTitle.textContent.trim() || "story";
        this.setWorkflowStep("updating");
        this.setProgressBars(10, 100, 100, "10%", "Preparing", "Ready");

        const blob = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", endpoint);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.responseType = "blob";
            xhr.withCredentials = true;

            xhr.onprogress = (event) => {
                if (!event.lengthComputable) {
                    this.setProgressBars(45, 100, 100, "Packaging", "Server working", "Ready");
                    this.setStatus("Building .fstory", "Server is creating ZIP and streaming it...");
                    return;
                }

                const percent = Math.round((event.loaded / event.total) * 100);
                const overall = 15 + Math.round(percent * 0.8);
                this.setProgressBars(
                    overall,
                    100,
                    100,
                    `${overall}%`,
                    `Downloading ${percent}%`,
                    FetchStoryPackage.formatFileSize(event.loaded),
                );
                this.setStatus(
                    "Downloading .fstory",
                    `${FetchStoryPackage.formatFileSize(event.loaded)} / ${FetchStoryPackage.formatFileSize(event.total)}`
                );
            };

            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) {
                    readBlobText(xhr.response).then((message) => {
                        reject(new Error(message || "Download generation failed"));
                    });
                    return;
                }
                this.pendingDownloadDisposition = xhr.getResponseHeader("Content-Disposition") || "";
                resolve(xhr.response);
            };
            xhr.onerror = () => reject(new Error("Download failed"));
            xhr.send(JSON.stringify({ title, jobId: this.currentStoryJobId }));
        });

        const disposition = this.pendingDownloadDisposition || "";
        this.pendingDownloadDisposition = "";
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        const plainName = disposition.match(/filename="?([^";]+)"?/i);
        const fileName = encodedName
            ? decodeURIComponent(encodedName[1])
            : plainName
            ? plainName[1]
            : fallbackName;
        this.setProgressBars(100, 100, 100, "100%", "Downloaded", "Ready");
        FetchStoryPackage.download(blob, fileName);
    }

    async loadJobStory(jobId) {
        const response = await fetch(`/api/story/jobs/${encodeURIComponent(jobId)}/story`);
        const result = await response.json();
        if (!response.ok || result.error || !result.storyData) {
            throw new Error(result.error || "Updated story JSON could not be loaded");
        }
        return result.storyData;
    }

    clearCurrentPackage(clearStory) {
        FetchStoryPackage.dispose(this.currentFstoryContext);
        this.currentFstoryContext = null;
        if (!clearStory) return;

        this.dom.contentDiv.innerHTML = "";
        this.dom.storyTitle.textContent = "";
        this.currentStoryData = null;
        this.currentStoryMeta = {};
        this.currentStoryJobId = "";
        this.dom.appendFromJson.checked = false;
        this.updateJobCard();
        this.updateEmptyState();
    }

    async logoutPublicSession() {
        if (this.dom.logoutBtn) this.dom.logoutBtn.disabled = true;
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        } catch (err) {
            console.warn("Logout request failed:", err.message);
        } finally {
            window.location.href = "/login.html";
        }
    }

    applyStoryData(storyData, options = {}) {
        const enableAppend = options.enableAppend !== false;
        const displayStory = this.currentFstoryContext
            ? FetchStoryPackage.materialize(storyData, this.currentFstoryContext)
            : storyData;
        const normalized = this.normalizeStoryData(displayStory);
        this.allowTempPageLoading = false;
        this.currentStoryData = normalized;
        this.currentStoryJobId = options.jobId || this.currentStoryJobId;

        this.closeActiveStream();
        this.setFetchingState(false);

        this.dom.urlInput.value = normalized.url || "";
        this.dom.authorName.value = normalized["writer-name"] || "";
        this.dom.endPage.value = normalized.totalPage || "";
        this.dom.storyTitle.textContent = normalized.storyName || "";

        this.dom.contentDiv.innerHTML = "";
        const postKeys = Object.keys(normalized.posts.eng).sort((a, b) => Number(a) - Number(b));
        postKeys.forEach((postKey) => {
            const postBlock = document.createElement("div");
            postBlock.id = `story-post-${postKey}`;
            postBlock.className = "story-page";
            postBlock.style.padding = "2rem 0";
            postBlock.style.borderBottom = "1px dashed #ccc";
            postBlock.innerHTML = this.fixImagePaths(normalized.posts.eng[postKey] || "");
            this.dom.contentDiv.appendChild(postBlock);
        });

        this.currentPage = postKeys.length + 1;
        this.hasMorePages = false;
        this.isLoadingPages = false;

        this.setProgressBars(
            100,
            100,
            100,
            "100%",
            "100%",
            normalized["total-image"] ? `${normalized["image-downlaods"]}/${normalized["total-image"]}` : "No images"
        );

        this.updateStats({
            matchedPosts: postKeys.length,
            downloadedImages: normalized["image-downlaods"],
            skippedImages: Math.max(0, normalized["total-image"] - normalized["image-downlaods"]),
        });
        this.updateStoryMeta(normalized);
        this.currentStoryMeta = normalized;
        this.dom.appendFromJson.checked = enableAppend;
        this.setWorkflowStep("ready");
        this.setJobStatus("Ready", "complete");
        this.updateJobCard();
        this.updateEmptyState();
        this.applyPreviewFilters();
    }

    normalizeStoryData(storyData) {
        const meta = storyData.meta || {};
        const fetchInfo = storyData.fetch || {};
        const stats = storyData.stats || {};
        const posts = storyData.posts || {};
        const directEngPosts = Object.fromEntries(
            Object.entries(posts).filter(([key, value]) => /^\d+$/.test(key) && typeof value === "string")
        );
        const engPosts = posts.eng || directEngPosts;
        const hindiPosts = { ...(posts.hindi || {}), ...(posts.hin || {}) };
        const postKeys = Object.keys(engPosts)
            .map((key) => Number.parseInt(key, 10))
            .filter((key) => Number.isInteger(key) && key > 0);
        const lastPostNo = postKeys.length ? Math.max(...postKeys) : 0;
        const totalImages = Number(storyData["total-image"] || storyData.totalImages || stats.totalImages || this.countImagesInPosts(engPosts) || 0);

        return {
            ...storyData,
            url: storyData.url || meta.url || "",
            storyName: storyData.storyName || storyData.title || meta.storyName || "Uploaded Story",
            "writer-name": storyData["writer-name"] || storyData.writerName || storyData.author || meta.writerName || "",
            totalPage: Number(storyData.totalPage || storyData.totalPages || fetchInfo.totalPage || lastPostNo || 0),
            lastFetch: storyData.lastFetch || fetchInfo.lastFetch || new Date().toISOString(),
            "total-image": totalImages,
            "image-downlaods": Number(storyData["image-downlaods"] || storyData.downloadedImages || stats.imageDownloads || 0),
            "start-time": storyData["start-time"] || fetchInfo.startTime || "",
            "end time": storyData["end time"] || fetchInfo.endTime || "",
            "duration taken": storyData["duration taken"] || fetchInfo.durationText || "",
            "last-page-no": Number(storyData["last-page-no"] || storyData.lastPageNo || fetchInfo.lastPageNo || lastPostNo || 0),
            posts: { eng: engPosts, hin: hindiPosts },
        };
    }

    updateStoryMeta(storyData) {
        if (!this.dom.storyMetaArea) return;

        const rows = [
            ["Last Fetch", this.formatMetaValue(storyData.lastFetch)],
            ["Start", this.formatMetaValue(storyData["start-time"])],
            ["End", this.formatMetaValue(storyData["end time"])],
            ["Duration", this.formatMetaValue(storyData["duration taken"])],
            ["Last Page", storyData["last-page-no"] || 0],
        ];

        this.dom.storyMetaArea.innerHTML = rows
            .map(([label, value]) => `<span><b>${label}</b><small>${value}</small></span>`)
            .join("");
        this.updateJobCard();
    }

    formatMetaValue(value) {
        return value || "-";
    }

    setStatus(label, detail) {
        if (this.dom.progressText) {
            this.dom.progressText.textContent = detail ? `${label}: ${detail}` : label;
        }
        this.updateStickyStatus(label, detail || "");
    }

    updateStickyStatus(label, detail) {
        if (this.dom.stickyStatusLabel) this.dom.stickyStatusLabel.textContent = label || "Status";
        if (this.dom.stickyStatusDetail) this.dom.stickyStatusDetail.textContent = detail || "";
    }

    setProgressBars(overall, page, image, overallText, pageText, imageText) {
        const safeOverall = this.clampPercent(overall);
        const safePage = this.clampPercent(page);
        const safeImage = this.clampPercent(image);

        if (this.dom.progressBar) this.dom.progressBar.value = safeOverall;
        if (this.dom.pageProgressBar) this.dom.pageProgressBar.value = safePage;
        if (this.dom.imageProgressBar) this.dom.imageProgressBar.value = safeImage;
        if (this.dom.stickyProgressBar) this.dom.stickyProgressBar.value = safeOverall;
        if (this.dom.overallProgressText) this.dom.overallProgressText.textContent = overallText || `${safeOverall}%`;
        if (this.dom.pageProgressText) this.dom.pageProgressText.textContent = pageText || `${safePage}%`;
        if (this.dom.imageProgressText) this.dom.imageProgressText.textContent = imageText || `${safeImage}%`;
    }

    clampPercent(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.min(100, numeric));
    }

    getClampedInputValue(input, fallback, min, max) {
        const numeric = Number.parseInt(input && input.value, 10);
        const value = Number.isInteger(numeric) ? numeric : fallback;
        const clamped = Math.max(min, Math.min(max, value));
        if (input) input.value = String(clamped);
        return clamped;
    }

    setWorkflowStep(stepName) {
        if (!this.dom.statusTimeline) return;

        const order = ["uploaded", "scanning", "downloading", "updating", "ready"];
        const currentIndex = Math.max(0, order.indexOf(stepName));

        [...this.dom.statusTimeline.querySelectorAll("li")].forEach((item) => {
            const stepIndex = order.indexOf(item.dataset.step);
            item.classList.toggle("is-done", stepIndex >= 0 && stepIndex < currentIndex);
            item.classList.toggle("is-current", stepIndex === currentIndex);
        });
    }

    setJobStatus(text, state) {
        if (!this.dom.jobStatusPill) return;

        this.dom.jobStatusPill.textContent = text || "Idle";
        this.dom.jobStatusPill.classList.toggle("is-active", state === "active");
        this.dom.jobStatusPill.classList.toggle("is-complete", state === "complete");
        this.dom.jobStatusPill.classList.toggle("is-warning", state === "warning");
    }

    updateJobCard() {
        const data = this.currentStoryData || this.currentStoryMeta || {};
        const postCount = this.currentStoryData && this.currentStoryData.posts
            ? Object.keys(this.currentStoryData.posts.eng || {}).length
            : this.dom.contentDiv.querySelectorAll(".story-page").length;
        const totalImages = Number(data["total-image"] || data.totalImages || 0);
        const downloads = Number(data["image-downlaods"] || data.downloadedImages || 0);

        if (this.dom.jobStoryName) this.dom.jobStoryName.textContent = data.storyName || this.dom.storyTitle.textContent || "-";
        if (this.dom.jobPostsCount) this.dom.jobPostsCount.textContent = String(postCount || 0);
        if (this.dom.jobImagesCount) this.dom.jobImagesCount.textContent = String(totalImages || 0);
        if (this.dom.jobDownloadsCount) this.dom.jobDownloadsCount.textContent = String(downloads || 0);
    }

    resetWarnings() {
        this.warningItems = [];
        this.renderWarnings();
    }

    updateWarningsFromStats(stats) {
        if (!stats) return;

        const nextItems = [];
        if (stats.missingOriginalUrls) {
            nextItems.push(`${stats.missingOriginalUrls} images skipped because original URL was missing.`);
        }
        if (stats.skippedImages) {
            nextItems.push(`${stats.skippedImages} images skipped or failed during processing.`);
        }

        this.warningItems = nextItems;
        this.renderWarnings();
    }

    renderWarnings() {
        if (this.dom.warningSummary) this.dom.warningSummary.textContent = `Warnings: ${this.warningItems.length}`;
        if (this.dom.warningPanel) this.dom.warningPanel.hidden = this.warningItems.length === 0;
        if (this.dom.warningList) {
            this.dom.warningList.innerHTML = this.warningItems.map((item) => `<li>${this.escapeHtml(item)}</li>`).join("");
        }
    }

    updateEmptyState() {
        if (!this.dom.contentArea) return;
        const hasPosts = this.dom.contentDiv.querySelectorAll(".story-page").length > 0;
        this.dom.contentArea.classList.toggle("is-empty", !hasPosts);
    }

    updatePreviewToolbarState() {
        if (this.dom.showAllPostsBtn) this.dom.showAllPostsBtn.classList.toggle("is-active", this.previewMode === "all");
        if (this.dom.showFirstPostsBtn) this.dom.showFirstPostsBtn.classList.toggle("is-active", this.previewMode === "first");
    }

    applyPreviewFilters() {
        if (!this.dom.contentArea) return;

        const query = this.dom.postSearchInput ? this.dom.postSearchInput.value.trim().toLowerCase() : "";
        const posts = [...this.dom.contentDiv.querySelectorAll(".story-page")];
        this.dom.contentArea.classList.toggle("hide-images", this.dom.togglePreviewImages && !this.dom.togglePreviewImages.checked);

        posts.forEach((post, index) => {
            const isPastPreviewLimit = this.previewMode === "first" && index >= 10;
            const isSearchMiss = query && !post.textContent.toLowerCase().includes(query);
            post.classList.toggle("is-preview-hidden", isPastPreviewLimit);
            post.classList.toggle("is-filtered-out", Boolean(isSearchMiss));
        });

        this.updatePreviewToolbarState();
        this.updateEmptyState();
    }

    scrollToLatestPost() {
        const visiblePosts = [...this.dom.contentDiv.querySelectorAll(".story-page")]
            .filter((post) => !post.classList.contains("is-preview-hidden") && !post.classList.contains("is-filtered-out"));
        const target = visiblePosts[visiblePosts.length - 1] || this.dom.contentDiv;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    finishCurrentStoryMeta() {
        if (!this.fetchStartedAt) return;

        const completedAt = new Date();
        this.currentStoryMeta = {
            ...this.currentStoryMeta,
            lastFetch: completedAt.toISOString(),
            "end time": completedAt.toISOString(),
            "duration taken": this.formatDuration(completedAt - this.fetchStartedAt),
        };
    }

    formatDuration(milliseconds) {
        const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [
            hours ? `${hours}h` : "",
            minutes ? `${minutes}m` : "",
            `${seconds}s`,
        ].filter(Boolean).join(" ");
    }

    countImagesInPosts(posts) {
        return Object.values(posts).reduce((count, html) => {
            if (typeof html !== "string") return count;
            const matches = html.match(/<img\b/gi);
            return count + (matches ? matches.length : 0);
        }, 0);
    }

    fixImagePaths(html) {
        if (typeof html !== "string") return "";
        const tempBase = this.currentStoryJobId
            ? `/temp/jobs/${this.currentStoryJobId}/images/`
            : "/temp/images/";

        return html
            .replace(/src="\/temp\/images\//g, `src="${tempBase}`)
            .replace(/src="images\//g, `src="${tempBase}`)
            .replace(/src="\.\/images\//g, `src="${tempBase}`);
    }

    updateStats(data) {
        if (this.dom.statsText) {
            this.dom.statsText.textContent = `Posts: ${data.matchedPosts || 0} | Images: ${data.downloadedImages || 0} downloaded, ${data.skippedImages || 0} skipped`;
        }
        this.updateJobCard();
    }

    closeActiveStream() {
        if (this.activeEventSource) {
            this.activeEventSource.close();
            this.activeEventSource = null;
        }
    }

    setFetchingState(isFetching) {
        if (this.dom.fetchBtn) this.dom.fetchBtn.disabled = isFetching;
        if (this.dom.fetchDeletedBtn) this.dom.fetchDeletedBtn.disabled = isFetching;
        if (this.dom.cancelFetchBtn) {
            this.dom.cancelFetchBtn.disabled = !isFetching;
            this.dom.cancelFetchBtn.textContent = this.activeOperation === "images" ? "Cancel Process" : "Cancel Fetch";
        }
    }

    sanitizeFileName(name) {
        return name
            .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120) || "story";
    }

    saveCache() {
        if (this.activeEventSource || this.currentFstoryContext) return;

        const payload = {
            id: "lastStory",
            title: this.dom.storyTitle.textContent,
            html: this.dom.contentDiv.innerHTML,
            storyData: this.currentStoryData,
            jobId: this.currentStoryJobId,
            percent: this.dom.progressBar ? this.dom.progressBar.value : 0,
            pagePercent: this.dom.pageProgressBar ? this.dom.pageProgressBar.value : 0,
            imagePercent: this.dom.imageProgressBar ? this.dom.imageProgressBar.value : 0,
            overallProgressText: this.dom.overallProgressText ? this.dom.overallProgressText.textContent : "",
            progressText: this.dom.progressText ? this.dom.progressText.textContent : "",
            pageProgressText: this.dom.pageProgressText ? this.dom.pageProgressText.textContent : "",
            imageProgressText: this.dom.imageProgressText ? this.dom.imageProgressText.textContent : "",
            statsText: this.dom.statsText ? this.dom.statsText.textContent : "",
            storyMetaHtml: this.dom.storyMetaArea ? this.dom.storyMetaArea.innerHTML : "",
            savedAt: new Date().toISOString(),
        };

        this.saveBrowserCache(payload).catch((err) => {
            console.warn("IndexedDB cache save skipped:", err.message);
        });
    }

    async saveBrowserCache(payload) {
        return StoryCache.save(payload.storyData, {
            source: "index",
            appData: payload,
        });
    }

    async loadBrowserCache() {
        const record = await StoryCache.load();
        if (!record) return null;
        return {
            ...(record.appData || {}),
            storyData: record.storyData,
            source: record.source,
            savedAt: record.updatedAt,
        };
    }

    async restoreCachedFstoryPackage(cacheData = {}) {
        const storedPackage = await StoryCache.loadFstoryPackage();
        if (storedPackage?.meta) {
            const context = FetchStoryPackage.createContextFromStoredPackage(storedPackage);
            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = context;
            this.setProgressBars(100, 100, 100, "100%", "Images restored", `${context.images.size} / ${context.images.size}`);
            this.setStatus("Cached .fstory restored", `${context.sourceName} images loaded from IndexedDB.`);
            return true;
        }

        if (cacheData.packageBlob) {
            const packageName = cacheData.packageName || "cached-story.fstory";
            const packageFile = cacheData.packageBlob instanceof File
                ? cacheData.packageBlob
                : new File([cacheData.packageBlob], packageName, { type: cacheData.packageBlob.type || "application/zip" });
            const opened = await FetchStoryPackage.open(packageFile, {
                onProgress: (progress) => this.updateFstoryOpenProgress(progress),
            });
            FetchStoryPackage.dispose(this.currentFstoryContext);
            this.currentFstoryContext = opened.context;
            await StoryCache.saveFstoryPackage(opened.rawStoryData, opened.context, { packageName });
            this.setStatus("Cached .fstory migrated", `${opened.context.images.size} images saved to IndexedDB.`);
            return true;
        }

        if (!storedPackage?.meta) {
            this.setStatus("Cached package images missing", "Open the .fstory once to rebuild shared image storage.");
            return false;
        }
    }

    async clearBrowserCache() {
        return StoryCache.clear();
    }

    saveActiveFetch(context) {
        localStorage.setItem(this.CONFIG.ACTIVE_FETCH_KEY, JSON.stringify({
            ...context,
            savedAt: new Date().toISOString(),
        }));
    }

    loadActiveFetch() {
        try {
            return JSON.parse(localStorage.getItem(this.CONFIG.ACTIVE_FETCH_KEY) || "null");
        } catch (_) {
            this.clearActiveFetch();
            return null;
        }
    }

    clearActiveFetch() {
        localStorage.removeItem(this.CONFIG.ACTIVE_FETCH_KEY);
    }

    createClientJobId() {
        if (crypto.randomUUID) return crypto.randomUUID();

        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
        return [
            hex.slice(0, 4).join(""),
            hex.slice(4, 6).join(""),
            hex.slice(6, 8).join(""),
            hex.slice(8, 10).join(""),
            hex.slice(10, 16).join(""),
        ].join("-");
    }
}

// एप्लीकेशन इनिशियलाइज करने के लिए:
function readBlobText(blob) {
    if (!blob) return Promise.resolve("");
    return blob.text ? blob.text() : Promise.resolve("");
}

document.addEventListener("DOMContentLoaded", () => {
    new StoryScraperApp();
});
