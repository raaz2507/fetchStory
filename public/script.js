const contentDiv = document.getElementById("content");
const storyTitle = document.querySelector(".storyTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const pageProgressBar = document.getElementById("pageProgressBar");
const pageProgressText = document.getElementById("pageProgressText");
const imageProgressBar = document.getElementById("imageProgressBar");
const imageProgressText = document.getElementById("imageProgressText");
const statsText = document.getElementById("statsText");
const storyMetaArea = document.getElementById("storyMetaArea");
const fetchBtn = document.getElementById("fetchBtn");
const cancelFetchBtn = document.getElementById("cancelFetchBtn");
const insertJsonBtn = document.getElementById("insertJsonBtn");
const jsonUploadInput = document.getElementById("jsonUploadInput");
const cacheKey = "storyScraper:lastStory";
const themeKey = "storyScraper:theme";
const themeSelect = document.getElementById("themeSelect");

let activeEventSource = null;
let currentStoryMeta = {};
let fetchStartedAt = null;

// --- Scroll & Pagination States ---
let currentPage = 1;
let isLoadingPages = false;
let hasMorePages = true;

applyTheme(localStorage.getItem(themeKey) || "light");

themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
});

insertJsonBtn.addEventListener("click", () => {
    jsonUploadInput.click();
});

jsonUploadInput.addEventListener("change", async () => {
    const file = jsonUploadInput.files && jsonUploadInput.files[0];
    if (!file) return;

    try {
        progressText.textContent = "Uploading JSON...";
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

        applyStoryData(result.storyData);
        progressText.textContent = "JSON uploaded and fields updated";
        saveCache();
    } catch (err) {
        console.error(err);
        progressText.textContent = err.message || "Invalid JSON file";
    } finally {
        jsonUploadInput.value = "";
    }
});

document.getElementById("getMeta").addEventListener("click", async () => {
    const url = document.getElementById("urlInput").value.trim();

    if (!url) {
        progressText.textContent = "URL missing";
        return;
    }

    progressText.textContent = "Getting meta...";

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
        progressText.textContent = `Total Pages: ${data.totalPages || 1}`;
    } catch (err) {
        console.error(err);
        progressText.textContent = err.message || "Meta fetch failed";
    }
});

// --- Function to Load Single Page via API on Scroll ---
async function loadNextPage() {
    if (isLoadingPages || !hasMorePages) return;
    isLoadingPages = true;

    try {
        // 💡 बैकएंड के सुधरे हुए getSinglePage API को कॉल करें
        const response = await fetch(`/api/story/get-page?page=${currentPage}`);
        
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
    if (activeEventSource) return; // अगर लाइव स्ट्रीमिंग चल रही है तो स्क्रॉल लोड न करें

    const totalHeight = document.documentElement.scrollHeight;
    const currentScroll = window.innerHeight + window.scrollY;

    if (currentScroll >= totalHeight - 800) {
        loadNextPage();
    }
});

fetchBtn.addEventListener("click", () => {
    const appendFromJson = document.getElementById("appendFromJson").checked;
    if (!appendFromJson) {
        contentDiv.innerHTML = "";
        storyTitle.textContent = "";
    }
    progressBar.value = 0;
    pageProgressBar.value = 0;
    imageProgressBar.value = 0;
    progressText.textContent = "Starting...";
    pageProgressText.textContent = "0%";
    imageProgressText.textContent = "0%";
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

    closeActiveStream();
    setFetchingState(true);

    activeEventSource = new EventSource(`/api/story/stream?${params.toString()}`);

    activeEventSource.onerror = (err) => {
        console.error("SSE error", err);
        closeActiveStream();
        progressText.textContent = "Connection error";
        setFetchingState(false);
    };

    activeEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            closeActiveStream();
            progressText.textContent = data.error;
            setFetchingState(false);
            return;
        }

        if (data.done) {
            closeActiveStream();
            progressText.textContent = "Fetch complete";
            progressBar.value = 100;
            pageProgressBar.value = 100;
            imageProgressBar.value = 100;
            pageProgressText.textContent = "100%";
            imageProgressText.textContent = "100%";
            setFetchingState(false);
            
            // लाइव खत्म होने पर कुल रेंडर पोस्ट गिनें ताकि अगला स्क्रॉल सही नंबर से शुरू हो
            const totalLoadedPages = contentDiv.querySelectorAll('.story-page').length;
            currentPage = totalLoadedPages + 1;
            hasMorePages = totalLoadedPages > 0;

            if (data.storyData) {
                currentStoryMeta = normalizeStoryData(data.storyData);
            } else {
                finishCurrentStoryMeta();
            }
            updateStoryMeta(currentStoryMeta);
            saveCache();
            return;
        }

        // प्रोग्रेस अपडेट्स
        const overallPercent = data.overallPercent ?? data.percent ?? 0;
        const pagePercent = data.pagePercent ?? 0;
        const imagePercent = data.imagePercent ?? 0;

        progressBar.value = overallPercent;
        pageProgressBar.value = pagePercent;
        imageProgressBar.value = imagePercent;
        progressText.textContent = `Page ${data.currentPage || 1}/${data.totalPages || 1} | ${overallPercent}%`;
        pageProgressText.textContent = `${pagePercent}%`;
        
        imageProgressText.textContent = data.imagesEnabled === false
            ? "Disabled"
            : data.totalImagesOnCurrentPost
            ? `${data.currentImageIndex || 0}/${data.totalImagesOnCurrentPost} | ${imagePercent}%`
            : "No images";
            
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
        }

        saveCache();
    };
});

cancelFetchBtn.addEventListener("click", () => {
    closeActiveStream();
    setFetchingState(false);
    finishCurrentStoryMeta();
    updateStoryMeta(currentStoryMeta);
    saveCache();
    progressText.textContent = "Fetch cancelled";
});

document.getElementById("loadFromCache").addEventListener("click", () => {
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
        progressText.textContent = "No cache found";
        return;
    }

    try {
        const data = JSON.parse(cached);

        storyTitle.textContent = data.title || "";
        contentDiv.innerHTML = data.html || "";
        progressBar.value = data.percent || 0;
        pageProgressBar.value = data.pagePercent || 0;
        imageProgressBar.value = data.imagePercent || 0;
        progressText.textContent = data.progressText || "Loaded from cache";
        pageProgressText.textContent = data.pageProgressText || "0%";
        imageProgressText.textContent = data.imageProgressText || "0%";
        statsText.textContent = data.statsText || "Posts: 0 | Images: 0 downloaded, 0 skipped";
        if (storyMetaArea) {
            storyMetaArea.innerHTML = data.storyMetaHtml || storyMetaArea.innerHTML;
        }
        
        currentPage = contentDiv.querySelectorAll('.story-page').length + 1;
    } catch (err) {
        console.error(err);
        progressText.textContent = "Cache load failed";
    }
});

document.getElementById("clearCache").addEventListener("click", () => {
    localStorage.removeItem(cacheKey);
    progressText.textContent = "Cache cleared";
});

document.getElementById("downloadBtn").addEventListener("click", async () => {
    const title = storyTitle.textContent.trim() || "story";
    
    try {
        progressText.textContent = "Preparing ZIP download...";
        
        const response = await fetch('/api/story/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title })
        });

        if (!response.ok) throw new Error("ZIP generation failed");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFileName(title)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        progressText.textContent = "Download complete!";
    } catch (err) {
        console.error(err);
        progressText.textContent = "Download failed.";
    }
});

document.getElementById("openReaderBtn").addEventListener("click", () => {
    window.open("/reader_template.html", "_blank", "noopener");
});

function applyStoryData(storyData) {
    const normalized = normalizeStoryData(storyData);

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

    progressBar.value = 100;
    pageProgressBar.value = 100;
    imageProgressBar.value = 100;
    pageProgressText.textContent = "100%";
    imageProgressText.textContent = normalized["total-image"]
        ? `${normalized["image-downlaods"]}/${normalized["total-image"]}`
        : "No images";

    updateStats({
        matchedPosts: postKeys.length,
        downloadedImages: normalized["image-downlaods"],
        skippedImages: Math.max(0, normalized["total-image"] - normalized["image-downlaods"]),
    });
    updateStoryMeta(normalized);
    currentStoryMeta = normalized;
    document.getElementById("appendFromJson").checked = true;
}

function normalizeStoryData(storyData) {
    const posts = storyData.posts || {};
    const engPosts = posts.eng || {};
    const hindiPosts = posts.hindi || {};
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
            hindi: hindiPosts,
        },
    };
}

function updateStoryMeta(storyData) {
    if (!storyMetaArea) return;

    storyMetaArea.innerHTML = [
        `Last Fetch: ${formatMetaValue(storyData.lastFetch)}`,
        `Total Images: ${storyData["total-image"] || 0}`,
        `Image Downloads: ${storyData["image-downlaods"] || 0}`,
        `Start: ${formatMetaValue(storyData["start-time"])}`,
        `End: ${formatMetaValue(storyData["end time"])}`,
        `Duration: ${formatMetaValue(storyData["duration taken"])}`,
        `Last Page: ${storyData["last-page-no"] || 0}`,
    ].map((text) => `<span>${text}</span>`).join("");
}

function formatMetaValue(value) {
    return value || "-";
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
    return html
        .replace(/src="images\//g, 'src="/temp/images/')
        .replace(/src="\.\/images\//g, 'src="/temp/images/');
}

function updateStats(data) {
    statsText.textContent =
        `Posts: ${data.matchedPosts || 0} | Images: ${data.downloadedImages || 0} downloaded, ${data.skippedImages || 0} skipped`;
}

function closeActiveStream() {
    if (activeEventSource) {
        activeEventSource.close();
        activeEventSource = null;
    }
}

function setFetchingState(isFetching) {
    fetchBtn.disabled = isFetching;
    cancelFetchBtn.disabled = !isFetching;
}

function sanitizeFileName(name) {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "story";
}

function saveCache() {
    localStorage.setItem(cacheKey, JSON.stringify({
        title: storyTitle.textContent,
        html: contentDiv.innerHTML,
        percent: progressBar.value,
        pagePercent: pageProgressBar.value,
        imagePercent: imageProgressBar.value,
        progressText: progressText.textContent,
        pageProgressText: pageProgressText.textContent,
        imageProgressText: imageProgressText.textContent,
        statsText: statsText.textContent,
        storyMetaHtml: storyMetaArea ? storyMetaArea.innerHTML : ""
    }));
}

function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    themeSelect.value = nextTheme;
    localStorage.setItem(themeKey, nextTheme);
}
