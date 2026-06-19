const contentDiv = document.getElementById("content");
const storyTitle = document.querySelector(".storyTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const pageProgressBar = document.getElementById("pageProgressBar");
const pageProgressText = document.getElementById("pageProgressText");
const imageProgressBar = document.getElementById("imageProgressBar");
const imageProgressText = document.getElementById("imageProgressText");
const overallProgressText = document.getElementById("overallProgressText");
const statsText = document.getElementById("statsText");
const storyMetaArea = document.getElementById("storyMetaArea");
const stickyStatusLabel = document.getElementById("stickyStatusLabel");
const stickyStatusDetail = document.getElementById("stickyStatusDetail");
const stickyProgressBar = document.getElementById("stickyProgressBar");
const jobStatusPill = document.getElementById("jobStatusPill");
const jobStoryName = document.getElementById("jobStoryName");
const jobPostsCount = document.getElementById("jobPostsCount");
const jobImagesCount = document.getElementById("jobImagesCount");
const jobDownloadsCount = document.getElementById("jobDownloadsCount");
const statusTimeline = document.getElementById("statusTimeline");
const warningPanel = document.getElementById("warningPanel");
const warningSummary = document.getElementById("warningSummary");
const warningList = document.getElementById("warningList");
const contentArea = document.querySelector(".contentArea");
const showAllPostsBtn = document.getElementById("showAllPostsBtn");
const showFirstPostsBtn = document.getElementById("showFirstPostsBtn");
const togglePreviewImages = document.getElementById("togglePreviewImages");
const postSearchInput = document.getElementById("postSearchInput");
const scrollLatestBtn = document.getElementById("scrollLatestBtn");
const statusHeader = document.querySelector(".statusHeader");
const controlPanel = document.getElementById("controlPanel");
const controlPanelToggle = document.getElementById("controlPanelToggle");
const summaryPanel = document.getElementById("summaryPanel");
const summaryPanelToggle = document.getElementById("summaryPanelToggle");
const fetchBtn = document.getElementById("fetchBtn");
const cancelFetchBtn = document.getElementById("cancelFetchBtn");
const insertJsonBtn = document.getElementById("insertJsonBtn");
const jsonUploadInput = document.getElementById("jsonUploadInput");
const insertFstoryBtn = document.getElementById("insertFstoryBtn");
const fstoryUploadInput = document.getElementById("fstoryUploadInput");
const downloadFstoryBtn = document.getElementById("downloadFstoryBtn");
const cleanUploadedJsonBtn = document.getElementById("cleanUploadedJsonBtn");
const processUploadedImagesBtn = document.getElementById("processUploadedImagesBtn");
const logoutBtn = document.getElementById("logoutBtn");
const cacheKey = "storyScraper:lastStory";
const idbName = "storyScraperDB";
const idbStoreName = "cache";
const themeKey = "storyScraper:theme";
const themeSelect = document.getElementById("themeSelect");

let activeEventSource = null;
let currentStoryMeta = {};
let currentStoryData = null;
let currentStoryJobId = "";
let fetchStartedAt = null;
let lastScrollY = window.scrollY || 0;
let accumulatedScrollUp = 0;
let tickingHeaderVisibility = false;
let previewMode = "all";
let warningItems = [];
let activeOperation = "";
let currentFstoryContext = null;

// --- Scroll & Pagination States ---
let currentPage = 1;
let isLoadingPages = false;
let hasMorePages = true;
let allowTempPageLoading = false;

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

applyTheme(localStorage.getItem(themeKey) || "light");
restoreFromCache(false);
resetWarnings();
updateEmptyState();
updateJobCard();

themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
});

if (showAllPostsBtn) {
    showAllPostsBtn.addEventListener("click", () => {
        previewMode = "all";
        updatePreviewToolbarState();
        applyPreviewFilters();
    });
}

if (showFirstPostsBtn) {
    showFirstPostsBtn.addEventListener("click", () => {
        previewMode = "first";
        updatePreviewToolbarState();
        applyPreviewFilters();
    });
}

if (togglePreviewImages) {
    togglePreviewImages.addEventListener("change", applyPreviewFilters);
}

if (postSearchInput) {
    postSearchInput.addEventListener("input", applyPreviewFilters);
}

if (scrollLatestBtn) {
    scrollLatestBtn.addEventListener("click", scrollToLatestPost);
}

if (controlPanelToggle && controlPanel) {
    controlPanelToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleControlPanel();
    });

    controlPanel.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        closeControlPanel();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeControlPanel();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 980) {
            closeControlPanel();
        }
    });
}

if (summaryPanelToggle && summaryPanel) {
    summaryPanelToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSummaryPanel();
    });

    summaryPanel.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        closeSummaryPanel();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSummaryPanel();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 980) {
            closeSummaryPanel();
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutPublicSession);
}

insertJsonBtn.addEventListener("click", () => {
    jsonUploadInput.click();
});

jsonUploadInput.addEventListener("change", async () => {
    const file = jsonUploadInput.files && jsonUploadInput.files[0];
    if (!file) return;

    try {
        FetchStoryPackage.dispose(currentFstoryContext);
        currentFstoryContext = null;
        resetWarnings();
        setWorkflowStep("uploaded");
        setJobStatus("Uploading", "active");
        setStatus("Uploading", "Reading and sending JSON file...");
        const storyData = JSON.parse(await file.text());

        const response = await fetch("/api/story/upload-json", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ storyData }),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "JSON upload failed");
        }

        currentStoryJobId = result.jobId || "";
        applyStoryData(result.storyData);
        setWorkflowStep("uploaded");
        setJobStatus("Uploaded", "complete");
        setStatus("JSON uploaded", "Fields and preview updated.");
        saveCache();
    } catch (err) {
        console.error(err);
        setJobStatus("Error", "warning");
        setStatus("Upload failed", err.message || "Invalid JSON file");
    } finally {
        jsonUploadInput.value = "";
    }
});

if (insertFstoryBtn && fstoryUploadInput) {
    insertFstoryBtn.addEventListener("click", () => fstoryUploadInput.click());

    fstoryUploadInput.addEventListener("change", async () => {
        const file = fstoryUploadInput.files && fstoryUploadInput.files[0];
        if (!file) return;

        try {
            resetWarnings();
            setJobStatus("Opening package", "active");
            setStatus("Opening .fstory", "Reading manifest, story JSON, and images locally...");
            const opened = await FetchStoryPackage.open(file);
            const response = await fetch("/api/story/upload-json", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storyData: opened.rawStoryData }),
            });
            const result = await response.json();
            if (!response.ok || result.error) {
                throw new Error(result.error || "Story JSON could not be prepared");
            }

            FetchStoryPackage.dispose(currentFstoryContext);
            currentFstoryContext = opened.context;
            currentStoryJobId = result.jobId || "";
            applyStoryData(result.storyData);
            setJobStatus("Package loaded", "complete");
            setStatus(
                ".fstory opened",
                `${opened.manifest.contentFile} loaded. ZIP and images stayed in the browser.`,
            );
        } catch (err) {
            console.error(err);
            setJobStatus("Error", "warning");
            setStatus("Package open failed", err.message || "Invalid .fstory package");
        } finally {
            fstoryUploadInput.value = "";
        }
    });
}

if (downloadFstoryBtn) {
    downloadFstoryBtn.addEventListener("click", async () => {
        if (!currentStoryData) {
            setStatus("No story ready", "Fetch, upload JSON, or open an .fstory first.");
            return;
        }

        try {
            downloadFstoryBtn.disabled = true;
            setJobStatus("Packaging", "active");
            setStatus("Building .fstory", "Collecting story JSON and images locally...");
            const result = await FetchStoryPackage.build(currentStoryData, currentFstoryContext);
            FetchStoryPackage.download(result.blob, result.fileName);
            setJobStatus("Ready", "complete");
            setStatus(".fstory ready", `${result.fileName} downloaded.`);
        } catch (err) {
            console.error(err);
            setJobStatus("Error", "warning");
            setStatus("Package download failed", err.message || "Could not create .fstory");
        } finally {
            downloadFstoryBtn.disabled = false;
        }
    });
}

cleanUploadedJsonBtn.addEventListener("click", async () => {
    try {
        if (!currentStoryJobId && !currentStoryData) {
            setStatus("Upload JSON first", "Insert a JSON file before cleaning it.");
            return;
        }

        closeActiveStream();
        resetWarnings();
        setWorkflowStep("updating");
        setJobStatus("Cleaning", "active");
        setStatus("Cleaning JSON", "Normalizing uploaded story data...");
        cleanUploadedJsonBtn.disabled = true;
        cleanUploadedJsonBtn.textContent = "Cleaning...";

        if (currentStoryJobId) {
            const response = await fetch("/api/story/clean-uploaded-json", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ jobId: currentStoryJobId }),
            });
            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || "JSON clean failed");
            }

            applyStoryData(result.storyData);
        } else {
            applyStoryData(normalizeStoryData(currentStoryData));
        }

        setWorkflowStep("ready");
        setJobStatus("Cleaned", "complete");
        setStatus("JSON cleaned", "Story format normalized and preview updated.");
        saveCache();
    } catch (err) {
        console.error(err);
        setJobStatus("Error", "warning");
        setStatus("JSON clean failed", err.message || "JSON clean failed");
    } finally {
        cleanUploadedJsonBtn.disabled = false;
        cleanUploadedJsonBtn.textContent = "Clean JSON";
    }
});

processUploadedImagesBtn.addEventListener("click", () => {
    try {
        if (!currentStoryJobId) {
            setStatus("Upload JSON first", "Insert a JSON file before processing images.");
            return;
        }

        closeActiveStream();
        resetWarnings();
        setWorkflowStep("scanning");
        setJobStatus("Processing", "active");
        setStatus("Processing JSON images", "Scanning posts and image links...");
        setProgressBars(0, 0, 0, "0%", "0%", "0%");
        processUploadedImagesBtn.disabled = true;
        processUploadedImagesBtn.textContent = "Processing...";
        activeOperation = "images";
        setFetchingState(true);

        activeEventSource = new EventSource(
            `/api/story/process-uploaded-images-stream?jobId=${encodeURIComponent(currentStoryJobId)}`,
            { withCredentials: true }
        );

        activeEventSource.onerror = (err) => {
            console.error("Uploaded image SSE error", err);
            closeActiveStream();
            processUploadedImagesBtn.disabled = false;
            processUploadedImagesBtn.textContent = "Process Images";
            activeOperation = "";
            setFetchingState(false);
            setJobStatus("Error", "warning");
            setStatus("Connection error", "Image processing connection failed.");
        };

        activeEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.jobId) currentStoryJobId = data.jobId;

            if (data.error) {
                closeActiveStream();
                processUploadedImagesBtn.disabled = false;
                processUploadedImagesBtn.textContent = "Process Images";
                activeOperation = "";
                setFetchingState(false);
                setJobStatus("Error", "warning");
                setStatus("Image processing failed", data.error);
                return;
            }

            if (data.done) {
                closeActiveStream();
                processUploadedImagesBtn.disabled = false;
                processUploadedImagesBtn.textContent = "Re-process Images";
                activeOperation = "";
                setFetchingState(false);
                setWorkflowStep("ready");
                applyStoryData(data.storyData);
                const stats = data.stats || {};
                updateWarningsFromStats(stats);
                setJobStatus("Ready", "complete");
                setStatus(
                    "Images processed",
                    `${stats.downloadedImages || 0} downloaded, ${stats.skippedImages || 0} skipped`
                );
                saveCache();
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

            setProgressBars(overallPercent, pagePercent, imagePercent, overallText, pageText, imageText);

            setWorkflowStep(data.totalImages ? "downloading" : "scanning");
            setStatus(data.message || "Processing JSON images", overallText);
            updateWarningsFromStats(data);
            updateStats({
                matchedPosts: data.processedPosts || 0,
                downloadedImages: data.downloadedImages || 0,
                skippedImages: data.skippedImages || 0,
            });
            currentStoryMeta = {
                ...currentStoryMeta,
                lastFetch: new Date().toISOString(),
                "total-image": data.totalImages || currentStoryMeta["total-image"] || 0,
                "image-downlaods": data.downloadedImages || 0,
            };
            updateStoryMeta(currentStoryMeta);
        };
    } catch (err) {
        console.error(err);
        closeActiveStream();
        processUploadedImagesBtn.disabled = false;
        processUploadedImagesBtn.textContent = "Process Images";
        activeOperation = "";
        setFetchingState(false);
        setJobStatus("Error", "warning");
        setStatus("Image processing failed", err.message || "Image processing failed");
    }
});

document.getElementById("getMeta").addEventListener("click", async () => {
    const url = document.getElementById("urlInput").value.trim();

    if (!url) {
        setStatus("URL missing", "Paste a story URL first.");
        return;
    }

    setJobStatus("Checking", "active");
    setStatus("Getting meta", "Reading title, author and page count...");

    try {
        const response = await fetch(`/api/story/meta?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || "Meta fetch failed");
        }

        storyTitle.textContent = data.title || "";
        const authorInput = document.getElementById("authorName");
        if (data.writerName && !authorInput.value.trim()) {
            authorInput.value = data.writerName;
        }
        document.getElementById("endPage").value = data.totalPages || "";
        setJobStatus("Meta ready", "complete");
        setStatus("Meta ready", `Total Pages: ${data.totalPages || 1}`);
    } catch (err) {
        console.error(err);
        setJobStatus("Error", "warning");
        setStatus("Meta fetch failed", err.message || "Meta fetch failed");
    }
});

// --- Function to Load Single Page via API on Scroll ---
async function loadNextPage() {
    if (!allowTempPageLoading || isLoadingPages || !hasMorePages) return;
    if (!currentStoryJobId) return;
    isLoadingPages = true;

    try {
        // 💡 बैकएंड के सुधरे हुए getSinglePage API को कॉल करें
        const response = await fetch(
            `/api/story/get-page?page=${currentPage}&jobId=${encodeURIComponent(currentStoryJobId)}`
        );
        
        if (response.status === 404) {
            // इसका मतलब है कि अगला पेज अभी बैकएंड स्क्रैप कर रहा है या उपलब्ध नहीं है
            isLoadingPages = false;
            return;
        }

        const data = await response.json();

        if (response.ok && data.html) {
            if (data.storyName && storyTitle.textContent === "") {
                storyTitle.textContent = data.storyName;
            }

            // 💡 चेक करें कि स्क्रोल करते समय क्या यह पोस्ट पहले से स्क्रीन पर किसी वजह से रेंडर तो नहीं है?
            let postBlock = document.getElementById(`story-post-${data.page}`);
            
            if (!postBlock) {
                postBlock = document.createElement('div');
                postBlock.id = `story-post-${data.page}`;
                postBlock.className = "story-page";
                postBlock.style.padding = "2rem 0";
                postBlock.style.borderBottom = "1px dashed #ccc";
                contentDiv.appendChild(postBlock);
            }
            
            postBlock.innerHTML = data.html;

            currentPage++; 
            hasMorePages = data.hasNextPage;

            // अगर स्क्रीन छोटी है और स्क्रोलबार नहीं आया, तो तुरंत अगला पेज भी खींच लें
            setTimeout(() => {
                if (document.body.offsetHeight <= window.innerHeight && hasMorePages) {
                    loadNextPage();
                }
            }, 300);

        } else {
            hasMorePages = false; 
        }
    } catch (err) {
        console.error("Error loading page:", err);
    } finally {
        isLoadingPages = false;
    }
}

// --- स्क्रोल लिसनर ---
window.addEventListener('scroll', () => {
    updateStatusHeaderVisibility();
    if (activeEventSource) return; // अगर लाइव स्ट्रीमिंग चल रही है तो स्क्रॉल लोड न करें

    const totalHeight = document.documentElement.scrollHeight;
    const currentScroll = window.innerHeight + window.scrollY;

    if (currentScroll >= totalHeight - 800) {
        loadNextPage();
    }
});

function updateStatusHeaderVisibility() {
    if ((!statusHeader && !summaryPanel) || tickingHeaderVisibility) return;

    tickingHeaderVisibility = true;
    window.requestAnimationFrame(() => {
        const currentY = Math.max(0, window.scrollY || 0);
        const delta = currentY - lastScrollY;

        if (currentY < 24) {
            showScrollSensitivePanels();
            accumulatedScrollUp = 0;
        } else if (delta > 8) {
            hideScrollSensitivePanels();
            accumulatedScrollUp = 0;
        } else if (delta < 0) {
            accumulatedScrollUp += Math.abs(delta);
            if (accumulatedScrollUp >= 12) {
                showScrollSensitivePanels();
            }
        }

        lastScrollY = currentY;
        tickingHeaderVisibility = false;
    });
}

function hideScrollSensitivePanels() {
    if (statusHeader) {
        statusHeader.classList.add("is-hidden");
        statusHeader.classList.remove("is-visible");
    }

    if (summaryPanel) {
        summaryPanel.classList.add("is-scroll-hidden");
        summaryPanel.classList.remove("is-scroll-visible");
    }
}

function showScrollSensitivePanels() {
    if (statusHeader) {
        statusHeader.classList.remove("is-hidden");
        statusHeader.classList.add("is-visible");
    }

    if (summaryPanel) {
        summaryPanel.classList.remove("is-scroll-hidden");
        summaryPanel.classList.add("is-scroll-visible");
    }
}

function toggleControlPanel() {
    if (!controlPanel) return;

    const isOpen = controlPanel.classList.toggle("is-open");
    if (isOpen) {
        closeSummaryPanel();
    }
    if (controlPanelToggle) {
        controlPanelToggle.setAttribute("aria-expanded", String(isOpen));
        controlPanelToggle.textContent = isOpen ? "Close" : "Controls";
    }
}

function closeControlPanel() {
    if (!controlPanel || !controlPanel.classList.contains("is-open")) return;

    controlPanel.classList.remove("is-open");
    if (controlPanelToggle) {
        controlPanelToggle.setAttribute("aria-expanded", "false");
        controlPanelToggle.textContent = "Controls";
    }
}

function toggleSummaryPanel() {
    if (!summaryPanel) return;

    const isOpen = summaryPanel.classList.toggle("is-open");
    if (isOpen) {
        closeControlPanel();
    }
    if (summaryPanelToggle) {
        summaryPanelToggle.setAttribute("aria-expanded", String(isOpen));
        summaryPanelToggle.textContent = isOpen ? "Close" : "Status";
    }
}

function closeSummaryPanel() {
    if (!summaryPanel || !summaryPanel.classList.contains("is-open")) return;

    summaryPanel.classList.remove("is-open");
    if (summaryPanelToggle) {
        summaryPanelToggle.setAttribute("aria-expanded", "false");
        summaryPanelToggle.textContent = "Status";
    }
}

fetchBtn.addEventListener("click", () => {
    allowTempPageLoading = true;
    const appendFromJson = document.getElementById("appendFromJson").checked;
    if (!appendFromJson) {
        contentDiv.innerHTML = "";
        storyTitle.textContent = "";
        currentStoryData = null;
        currentStoryJobId = "";
    }
    resetWarnings();
    setWorkflowStep("scanning");
    setProgressBars(0, 0, 0, "0%", "0%", "0%");
    setJobStatus("Fetching", "active");
    setStatus("Starting fetch", "Preparing source and page range...");
    const existingPostCount = contentDiv.querySelectorAll(".story-page").length;
    updateStats({ matchedPosts: appendFromJson ? existingPostCount : 0, downloadedImages: 0, skippedImages: 0 });

    currentPage = appendFromJson ? existingPostCount + 1 : 1;
    isLoadingPages = false;
    hasMorePages = true;
    fetchStartedAt = new Date();
    currentStoryMeta = {
        ...(appendFromJson ? currentStoryMeta : {}),
        lastFetch: fetchStartedAt.toISOString(),
        "total-image": appendFromJson ? currentStoryMeta["total-image"] || 0 : 0,
        "image-downlaods": appendFromJson ? currentStoryMeta["image-downlaods"] || 0 : 0,
        "start-time": fetchStartedAt.toISOString(),
        "end time": "",
        "duration taken": "",
        "last-page-no": appendFromJson ? currentStoryMeta["last-page-no"] || 0 : 0,
    };
    updateStoryMeta(currentStoryMeta);

    const url = document.getElementById("urlInput").value.trim();
    const author = document.getElementById("authorName").value.trim();
    const startPage = document.getElementById("startPage").value;
    const endPage = document.getElementById("endPage").value;
    const loadImages = document.getElementById("loadImages").checked;

    const params = new URLSearchParams({ url, author });
    if (startPage) params.set("startPage", startPage);
    if (endPage) params.set("endPage", endPage);
    params.set("loadImages", loadImages ? "1" : "0");
    params.set("append", appendFromJson ? "1" : "0");
    if (appendFromJson && currentStoryJobId) {
        params.set("jobId", currentStoryJobId);
    }

    closeActiveStream();
    activeOperation = "fetch";
    setFetchingState(true);

    activeEventSource = new EventSource(`/api/story/stream?${params.toString()}`, {
        withCredentials: true,
    });

    activeEventSource.onerror = (err) => {
        console.error("SSE error", err);
        closeActiveStream();
            setJobStatus("Error", "warning");
            setStatus("Connection error", "Live fetch connection failed.");
            activeOperation = "";
            setFetchingState(false);
    };

    activeEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            if (data.jobId) currentStoryJobId = data.jobId;
            closeActiveStream();
            setJobStatus("Error", "warning");
            setStatus("Fetch failed", data.error);
            activeOperation = "";
            setFetchingState(false);
            return;
        }

        if (data.done) {
            if (data.jobId) currentStoryJobId = data.jobId;
            closeActiveStream();
            allowTempPageLoading = true;
            setWorkflowStep("ready");
            setProgressBars(100, 100, 100, "100%", "100%", "100%");
            setJobStatus("Ready", "complete");
            setStatus("Fetch complete", "Story JSON and preview are ready.");
            activeOperation = "";
            setFetchingState(false);
            
            // लाइव खत्म होने पर कुल रेंडर पोस्ट गिनें ताकि अगला स्क्रॉल सही नंबर से शुरू हो
            const totalLoadedPages = contentDiv.querySelectorAll('.story-page').length;
            currentPage = totalLoadedPages + 1;
            hasMorePages = totalLoadedPages > 0;

            if (data.storyData) {
                currentStoryData = normalizeStoryData(data.storyData);
                currentStoryMeta = currentStoryData;
            } else if (data.meta) {
                finishCurrentStoryMeta();
                currentStoryMeta = {
                    ...currentStoryMeta,
                    ...data.meta,
                };
            } else {
                finishCurrentStoryMeta();
            }
            updateStoryMeta(currentStoryMeta);
            saveCache();
            return;
        }

        // प्रोग्रेस अपडेट्स
        const overallPercent = data.overallPercent ?? data.percent ?? 0;
        if (data.jobId) currentStoryJobId = data.jobId;
        const pagePercent = data.pagePercent ?? 0;
        const imagePercent = data.imagePercent ?? 0;

        const pageText = `Page ${data.currentPage || 1}/${data.totalPages || 1} | ${pagePercent}%`;
        const imageText = data.imagesEnabled === false
            ? "Disabled"
            : data.totalImagesOnCurrentPost
            ? `${data.currentImageIndex || 0}/${data.totalImagesOnCurrentPost} | ${imagePercent}%`
            : "No images";
        const overallText = `Page ${data.currentPage || 1}/${data.totalPages || 1} | ${overallPercent}%`;

        setWorkflowStep(data.imagesEnabled === false || !data.totalImagesOnCurrentPost ? "scanning" : "downloading");
        setProgressBars(overallPercent, pagePercent, imagePercent, overallText, pageText, imageText);
        setStatus("Fetching story", overallText);
            
        updateStats(data);
        currentStoryMeta = {
            ...currentStoryMeta,
            lastFetch: new Date().toISOString(),
            "total-image": data.totalImages || currentStoryMeta["total-image"] || 0,
            "image-downlaods": data.downloadedImages || currentStoryMeta["image-downlaods"] || 0,
            "last-page-no": data.currentPage || 0,
        };
        updateStoryMeta(currentStoryMeta);

        if (data.title && storyTitle.textContent === "") {
            storyTitle.textContent = data.title;
        }

        // 🔥 लाइव कंटेंट रेंडरिंग लॉजिक (यही समस्या फिक्स करता है):
        // अब हम बैकएंड के नए 'currentPostNum' (यानी matchedPosts) का उपयोग करेंगे
        const targetPostId = data.currentPostNum || data.matchedPosts;

        if (data.html && targetPostId) {
            // आईडी के जरिए सटीक एलिमेंट ढूंढें
            let existingPost = document.getElementById(`story-post-${targetPostId}`);
            
            if (!existingPost) {
                // अगर पहली बार यह पोस्ट आई है, तो फ्रेश कन्टेंट ब्लॉक बनाएँ
                existingPost = document.createElement('div');
                existingPost.id = `story-post-${targetPostId}`;
                existingPost.className = "story-page";
                existingPost.style.padding = "2rem 0";
                existingPost.style.borderBottom = "1px dashed #ccc";
                contentDiv.appendChild(existingPost);
                
                // स्क्रॉल ट्रैक करने वाले वेरिएबल को लाइव सिंक रखें
                currentPage = targetPostId + 1;
                hasMorePages = true; 
            }
            
            // 💡 मास्टरस्ट्रोक: कंटेंट को अपेंड करने के बजाय सीधे रीप्लेस करें! 
            // इससे जब इमेज लोड होगी, तो पुराना ब्लॉक अपडेट हो जाएगा, नया नहीं जुड़ेगा।
            existingPost.innerHTML = data.html;
            applyPreviewFilters();
            updateEmptyState();
        }

        saveCache();
    };
});

cancelFetchBtn.addEventListener("click", () => {
    const cancelledOperation = activeOperation;
    closeActiveStream();
    activeOperation = "";
    setFetchingState(false);
    if (cancelledOperation === "fetch") {
        finishCurrentStoryMeta();
        updateStoryMeta(currentStoryMeta);
    } else if (cancelledOperation === "images") {
        processUploadedImagesBtn.disabled = false;
        processUploadedImagesBtn.textContent = "Process Images";
    }
    saveCache();
    setJobStatus("Cancelled", "warning");
    setStatus(
        cancelledOperation === "images" ? "Image processing cancelled" : "Fetch cancelled",
        cancelledOperation === "images" ? "Image processing was stopped." : "Current fetch was stopped."
    );
});

document.getElementById("loadFromCache").addEventListener("click", () => {
    restoreFromCache(true);
});

async function restoreFromCache(showMissingMessage) {
    let data = null;

    try {
        data = await loadBrowserCache();
    } catch (err) {
        console.warn("IndexedDB cache load failed:", err.message);
        if (showMissingMessage) {
            setStatus("Cache load failed", err.message);
        }
        return;
    }

    if (!data) {
        if (showMissingMessage) {
            setStatus("No cache found", "There is no saved browser cache yet.");
        }
        return;
    }

    try {
        allowTempPageLoading = false;
        currentStoryJobId = data.jobId || "";

        if (data.storyData) {
            applyStoryData(data.storyData, { enableAppend: false, jobId: currentStoryJobId });
        } else {
            storyTitle.textContent = data.title || "";
            contentDiv.innerHTML = data.html || "";
        }

        setProgressBars(
            data.percent || 0,
            data.pagePercent || 0,
            data.imagePercent || 0,
            data.overallProgressText || `${data.percent || 0}%`,
            data.pageProgressText || "0%",
            data.imageProgressText || "0%"
        );
        setJobStatus("Loaded", "complete");
        setStatus("Loaded from cache", showMissingMessage
            ? "Loaded from cache"
            : data.progressText || "Loaded from cache");
        statsText.textContent = data.statsText || "Posts: 0 | Images: 0 downloaded, 0 skipped";
        if (storyMetaArea) {
            storyMetaArea.innerHTML = data.storyMetaHtml || storyMetaArea.innerHTML;
        }
        
        currentPage = contentDiv.querySelectorAll('.story-page').length + 1;
        hasMorePages = false;
        updateJobCard();
        updateEmptyState();
        applyPreviewFilters();
    } catch (err) {
        console.error(err);
        setStatus("Cache load failed", err.message || "Cache load failed");
    }
}

document.getElementById("clearCache").addEventListener("click", async () => {
    localStorage.removeItem(cacheKey);
    await clearBrowserCache();
    allowTempPageLoading = false;
    contentDiv.innerHTML = "";
    storyTitle.textContent = "";
    currentStoryData = null;
    currentStoryJobId = "";
    currentPage = 1;
    hasMorePages = false;
    resetWarnings();
    setWorkflowStep("uploaded");
    setProgressBars(0, 0, 0, "0%", "0%", "0%");
    updateStats({ matchedPosts: 0, downloadedImages: 0, skippedImages: 0 });
    updateStoryMeta({
        lastFetch: "",
        "total-image": 0,
        "image-downlaods": 0,
        "start-time": "",
        "end time": "",
        "duration taken": "",
        "last-page-no": 0,
    });
    setJobStatus("Idle", "");
    setStatus("Cache cleared", "Ready for a fresh story.");
    updateJobCard();
    updateEmptyState();
});

document.getElementById("downloadBtn").addEventListener("click", async () => {
    const title = storyTitle.textContent.trim() || "story";
    
    try {
        if (!currentStoryJobId) {
            setStatus("No story ready", "Fetch or upload a story first.");
            return;
        }

        setWorkflowStep("updating");
        setJobStatus("Packaging", "active");
        setStatus("Preparing ZIP", "Preparing files...");
        
        const response = await fetch('/api/story/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, jobId: currentStoryJobId })
        });

        if (!response.ok) throw new Error("ZIP generation failed");

        setStatus("Preparing ZIP", "Creating download file...");
        const blob = await response.blob();
        setStatus("ZIP ready", "Starting browser download...");
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFileName(title)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        setWorkflowStep("ready");
        setJobStatus("Ready", "complete");
        setStatus("Download complete", "ZIP file has been downloaded.");
    } catch (err) {
        console.error(err);
        setJobStatus("Error", "warning");
        setStatus("Download failed", err.message || "Download failed.");
    }
});

document.getElementById("openReaderBtn").addEventListener("click", () => {
    window.open("/reader-translator", "_blank", "noopener");
});

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

function applyStoryData(storyData, options = {}) {
    const enableAppend = options.enableAppend !== false;
    const displayStory = currentFstoryContext
        ? FetchStoryPackage.materialize(storyData, currentFstoryContext)
        : storyData;
    const normalized = normalizeStoryData(displayStory);
    allowTempPageLoading = false;
    currentStoryData = normalized;
    currentStoryJobId = options.jobId || currentStoryJobId;

    closeActiveStream();
    setFetchingState(false);

    document.getElementById("urlInput").value = normalized.url || "";
    document.getElementById("authorName").value = normalized["writer-name"] || "";
    document.getElementById("endPage").value = normalized.totalPage || "";
    storyTitle.textContent = normalized.storyName || "";

    contentDiv.innerHTML = "";
    const postKeys = Object.keys(normalized.posts.eng).sort((a, b) => Number(a) - Number(b));
    postKeys.forEach((postKey) => {
        const postBlock = document.createElement("div");
        postBlock.id = `story-post-${postKey}`;
        postBlock.className = "story-page";
        postBlock.style.padding = "2rem 0";
        postBlock.style.borderBottom = "1px dashed #ccc";
        postBlock.innerHTML = fixImagePaths(normalized.posts.eng[postKey] || "");
        contentDiv.appendChild(postBlock);
    });

    currentPage = postKeys.length + 1;
    hasMorePages = false;
    isLoadingPages = false;

    setProgressBars(
        100,
        100,
        100,
        "100%",
        "100%",
        normalized["total-image"]
            ? `${normalized["image-downlaods"]}/${normalized["total-image"]}`
            : "No images"
    );

    updateStats({
        matchedPosts: postKeys.length,
        downloadedImages: normalized["image-downlaods"],
        skippedImages: Math.max(0, normalized["total-image"] - normalized["image-downlaods"]),
    });
    updateStoryMeta(normalized);
    currentStoryMeta = normalized;
    document.getElementById("appendFromJson").checked = enableAppend;
    setWorkflowStep("ready");
    setJobStatus("Ready", "complete");
    updateJobCard();
    updateEmptyState();
    applyPreviewFilters();
}

function normalizeStoryData(storyData) {
    const posts = storyData.posts || {};
    const directEngPosts = Object.fromEntries(
        Object.entries(posts).filter(([key, value]) => {
            return /^\d+$/.test(key) && typeof value === "string";
        })
    );
    const engPosts = posts.eng || directEngPosts;
    const hindiPosts = {
        ...(posts.hindi || {}),
        ...(posts.hin || {}),
    };
    const postKeys = Object.keys(engPosts)
        .map((key) => Number.parseInt(key, 10))
        .filter((key) => Number.isInteger(key) && key > 0);
    const lastPostNo = postKeys.length ? Math.max(...postKeys) : 0;
    const totalImages = Number(storyData["total-image"] || storyData.totalImages || countImagesInPosts(engPosts) || 0);

    return {
        ...storyData,
        url: storyData.url || "",
        storyName: storyData.storyName || storyData.title || "Uploaded Story",
        "writer-name": storyData["writer-name"] || storyData.writerName || storyData.author || "",
        totalPage: Number(storyData.totalPage || storyData.totalPages || lastPostNo || 0),
        lastFetch: storyData.lastFetch || new Date().toISOString(),
        "total-image": totalImages,
        "image-downlaods": Number(storyData["image-downlaods"] || storyData.downloadedImages || 0),
        "start-time": storyData["start-time"] || "",
        "end time": storyData["end time"] || "",
        "duration taken": storyData["duration taken"] || "",
        "last-page-no": Number(storyData["last-page-no"] || storyData.lastPageNo || lastPostNo || 0),
        posts: {
            eng: engPosts,
            hin: hindiPosts,
        },
    };
}

function updateStoryMeta(storyData) {
    if (!storyMetaArea) return;

    const rows = [
        ["Last Fetch", formatMetaValue(storyData.lastFetch)],
        ["Start", formatMetaValue(storyData["start-time"])],
        ["End", formatMetaValue(storyData["end time"])],
        ["Duration", formatMetaValue(storyData["duration taken"])],
        ["Last Page", storyData["last-page-no"] || 0],
    ];

    storyMetaArea.innerHTML = rows
        .map(([label, value]) => `<span><b>${label}</b><small>${value}</small></span>`)
        .join("");
    updateJobCard();
}

function formatMetaValue(value) {
    return value || "-";
}

function setStatus(label, detail) {
    if (progressText) {
        progressText.textContent = detail ? `${label}: ${detail}` : label;
    }
    updateStickyStatus(label, detail || "");
}

function updateStickyStatus(label, detail) {
    if (stickyStatusLabel) stickyStatusLabel.textContent = label || "Status";
    if (stickyStatusDetail) stickyStatusDetail.textContent = detail || "";
}

function setProgressBars(overall, page, image, overallText, pageText, imageText) {
    const safeOverall = clampPercent(overall);
    const safePage = clampPercent(page);
    const safeImage = clampPercent(image);

    progressBar.value = safeOverall;
    pageProgressBar.value = safePage;
    imageProgressBar.value = safeImage;
    if (stickyProgressBar) stickyProgressBar.value = safeOverall;
    if (overallProgressText) overallProgressText.textContent = overallText || `${safeOverall}%`;
    pageProgressText.textContent = pageText || `${safePage}%`;
    imageProgressText.textContent = imageText || `${safeImage}%`;
}

function clampPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric));
}

function setWorkflowStep(stepName) {
    if (!statusTimeline) return;

    const order = ["uploaded", "scanning", "downloading", "updating", "ready"];
    const currentIndex = Math.max(0, order.indexOf(stepName));

    [...statusTimeline.querySelectorAll("li")].forEach((item) => {
        const stepIndex = order.indexOf(item.dataset.step);
        item.classList.toggle("is-done", stepIndex >= 0 && stepIndex < currentIndex);
        item.classList.toggle("is-current", stepIndex === currentIndex);
    });
}

function setJobStatus(text, state) {
    if (!jobStatusPill) return;

    jobStatusPill.textContent = text || "Idle";
    jobStatusPill.classList.toggle("is-active", state === "active");
    jobStatusPill.classList.toggle("is-complete", state === "complete");
    jobStatusPill.classList.toggle("is-warning", state === "warning");
}

function updateJobCard() {
    const data = currentStoryData || currentStoryMeta || {};
    const postCount = currentStoryData && currentStoryData.posts
        ? Object.keys(currentStoryData.posts.eng || {}).length
        : contentDiv.querySelectorAll(".story-page").length;
    const totalImages = Number(data["total-image"] || data.totalImages || 0);
    const downloads = Number(data["image-downlaods"] || data.downloadedImages || 0);

    if (jobStoryName) jobStoryName.textContent = data.storyName || storyTitle.textContent || "-";
    if (jobPostsCount) jobPostsCount.textContent = String(postCount || 0);
    if (jobImagesCount) jobImagesCount.textContent = String(totalImages || 0);
    if (jobDownloadsCount) jobDownloadsCount.textContent = String(downloads || 0);
}

function resetWarnings() {
    warningItems = [];
    renderWarnings();
}

function updateWarningsFromStats(stats) {
    if (!stats) return;

    const nextItems = [];
    if (stats.missingOriginalUrls) {
        nextItems.push(`${stats.missingOriginalUrls} images skipped because original URL was missing.`);
    }
    if (stats.skippedImages) {
        nextItems.push(`${stats.skippedImages} images skipped or failed during processing.`);
    }

    warningItems = nextItems;
    renderWarnings();
}

function renderWarnings() {
    if (warningSummary) warningSummary.textContent = `Warnings: ${warningItems.length}`;
    if (warningPanel) warningPanel.hidden = warningItems.length === 0;
    if (warningList) {
        warningList.innerHTML = warningItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    }
}

function updateEmptyState() {
    if (!contentArea) return;
    const hasPosts = contentDiv.querySelectorAll(".story-page").length > 0;
    contentArea.classList.toggle("is-empty", !hasPosts);
}

function updatePreviewToolbarState() {
    if (showAllPostsBtn) showAllPostsBtn.classList.toggle("is-active", previewMode === "all");
    if (showFirstPostsBtn) showFirstPostsBtn.classList.toggle("is-active", previewMode === "first");
}

function applyPreviewFilters() {
    if (!contentArea) return;

    const query = postSearchInput ? postSearchInput.value.trim().toLowerCase() : "";
    const posts = [...contentDiv.querySelectorAll(".story-page")];
    contentArea.classList.toggle("hide-images", togglePreviewImages && !togglePreviewImages.checked);

    posts.forEach((post, index) => {
        const isPastPreviewLimit = previewMode === "first" && index >= 10;
        const isSearchMiss = query && !post.textContent.toLowerCase().includes(query);
        post.classList.toggle("is-preview-hidden", isPastPreviewLimit);
        post.classList.toggle("is-filtered-out", Boolean(isSearchMiss));
    });

    updatePreviewToolbarState();
    updateEmptyState();
}

function scrollToLatestPost() {
    const visiblePosts = [...contentDiv.querySelectorAll(".story-page")]
        .filter((post) => !post.classList.contains("is-preview-hidden") && !post.classList.contains("is-filtered-out"));
    const target = visiblePosts[visiblePosts.length - 1] || contentDiv;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function finishCurrentStoryMeta() {
    if (!fetchStartedAt) return;

    const completedAt = new Date();
    currentStoryMeta = {
        ...currentStoryMeta,
        lastFetch: completedAt.toISOString(),
        "end time": completedAt.toISOString(),
        "duration taken": formatDuration(completedAt - fetchStartedAt),
    };
}

function formatDuration(milliseconds) {
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

function countImagesInPosts(posts) {
    return Object.values(posts).reduce((count, html) => {
        if (typeof html !== "string") return count;
        const matches = html.match(/<img\b/gi);
        return count + (matches ? matches.length : 0);
    }, 0);
}

function fixImagePaths(html) {
    if (typeof html !== "string") return "";
    const tempBase = currentStoryJobId
        ? `/temp/jobs/${currentStoryJobId}/images/`
        : "/temp/images/";

    return html
        .replace(/src="\/temp\/images\//g, `src="${tempBase}`)
        .replace(/src="images\//g, `src="${tempBase}`)
        .replace(/src="\.\/images\//g, `src="${tempBase}`);
}

function updateStats(data) {
    statsText.textContent =
        `Posts: ${data.matchedPosts || 0} | Images: ${data.downloadedImages || 0} downloaded, ${data.skippedImages || 0} skipped`;
    updateJobCard();
}

function closeActiveStream() {
    if (activeEventSource) {
        activeEventSource.close();
        activeEventSource = null;
    }
}

function setFetchingState(isFetching) {
    fetchBtn.disabled = isFetching;
    cleanUploadedJsonBtn.disabled = isFetching;
    cancelFetchBtn.disabled = !isFetching;
    cancelFetchBtn.textContent = activeOperation === "images" ? "Cancel Process" : "Cancel Fetch";
}

function sanitizeFileName(name) {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "story";
}

function saveCache() {
    if (activeEventSource) {
        return;
    }

    const payload = {
        id: "lastStory",
        title: storyTitle.textContent,
        html: contentDiv.innerHTML,
        storyData: currentStoryData,
        jobId: currentStoryJobId,
        percent: progressBar.value,
        pagePercent: pageProgressBar.value,
        imagePercent: imageProgressBar.value,
        overallProgressText: overallProgressText ? overallProgressText.textContent : "",
        progressText: progressText.textContent,
        pageProgressText: pageProgressText.textContent,
        imageProgressText: imageProgressText.textContent,
        statsText: statsText.textContent,
        storyMetaHtml: storyMetaArea ? storyMetaArea.innerHTML : "",
        savedAt: new Date().toISOString(),
    };

    saveBrowserCache(payload).catch((err) => {
        console.warn("IndexedDB cache save skipped:", err.message);
    });
}

function openStoryCacheDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(idbName, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(idbStoreName)) {
                db.createObjectStore(idbStoreName, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveBrowserCache(payload) {
    const db = await openStoryCacheDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(idbStoreName, "readwrite");
        tx.objectStore(idbStoreName).put(payload);
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

async function loadBrowserCache() {
    const db = await openStoryCacheDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(idbStoreName, "readonly");
        const request = tx.objectStore(idbStoreName).get("lastStory");

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

async function clearBrowserCache() {
    const db = await openStoryCacheDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(idbStoreName, "readwrite");
        tx.objectStore(idbStoreName).delete("lastStory");
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

function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    themeSelect.value = nextTheme;
    localStorage.setItem(themeKey, nextTheme);
}
