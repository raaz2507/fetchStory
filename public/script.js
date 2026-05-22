const contentDiv = document.getElementById("content");
const storyTitle = document.querySelector(".storyTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const pageProgressBar = document.getElementById("pageProgressBar");
const pageProgressText = document.getElementById("pageProgressText");
const imageProgressBar = document.getElementById("imageProgressBar");
const imageProgressText = document.getElementById("imageProgressText");
const statsText = document.getElementById("statsText");
const fetchBtn = document.getElementById("fetchBtn");
const cancelFetchBtn = document.getElementById("cancelFetchBtn");
const cacheKey = "storyScraper:lastStory";
const themeKey = "storyScraper:theme";
const themeSelect = document.getElementById("themeSelect");

let activeEventSource = null;

// --- Scroll & Pagination States ---
let currentPage = 1;
let isLoadingPages = false;
let hasMorePages = true;

applyTheme(localStorage.getItem(themeKey) || "light");

themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
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
    contentDiv.innerHTML = "";
    storyTitle.textContent = "";
    progressBar.value = 0;
    pageProgressBar.value = 0;
    imageProgressBar.value = 0;
    progressText.textContent = "Starting...";
    pageProgressText.textContent = "0%";
    imageProgressText.textContent = "0%";
    updateStats({ matchedPosts: 0, downloadedImages: 0, skippedImages: 0 });

    currentPage = 1;
    isLoadingPages = false;
    hasMorePages = true;

    const url = document.getElementById("urlInput").value.trim();
    const author = document.getElementById("authorName").value.trim();
    const startPage = document.getElementById("startPage").value;
    const endPage = document.getElementById("endPage").value;
    const loadImages = document.getElementById("loadImages").checked;

    const params = new URLSearchParams({ url, author });
    if (startPage) params.set("startPage", startPage);
    if (endPage) params.set("endPage", endPage);
    params.set("loadImages", loadImages ? "1" : "0");

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
        statsText: statsText.textContent
    }));
}

function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    themeSelect.value = nextTheme;
    localStorage.setItem(themeKey, nextTheme);
}