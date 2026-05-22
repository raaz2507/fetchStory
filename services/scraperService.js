const axios = require("axios");
const cheerio = require("cheerio");

const { downloadImageWithHash } = require("./imageService");

async function getStoryMeta(originalURL) {
    const baseURL = getValidatedBaseURL(originalURL);
    const $firstPage = await fetchRequiredPage(baseURL);

    return {
        title: $firstPage(".p-title-value").text().trim(),
        totalPages: getLastPage($firstPage)
    };
}

async function scrapeStoryWithImages(originalURL, authorName, baseFolder, progressCallback, options = {}) {
    if (!authorName || !authorName.trim()) {
        throw createScrapeError("AUTHOR_MISSING", "Author name missing");
    }

    const baseURL = getValidatedBaseURL(originalURL);
    const startPage = options.startPage || 0;
    const endPage = options.endPage || 0;
    const loadImages = options.loadImages !== false;
    const signal = options.signal;

    throwIfCancelled(signal);

    const $firstPage = await fetchRequiredPage(baseURL, signal);
    const title = $firstPage(".p-title-value").text().trim();
    const detectedLastPage = getLastPage($firstPage);
    const lastPage = endPage > 0 && endPage <= detectedLastPage ? endPage : detectedLastPage;
    const firstPage = startPage > 1 && startPage <= lastPage ? startPage : 1;
    const totalPagesToFetch = lastPage - firstPage + 1;

    const stats = {
        matchedPosts: 0,
        downloadedImages: 0,
        skippedImages: 0,
        authorMatches: 0,
        loadedPages: 0,
        failedPages: 0,
        pagePercent: 0,
        imagePercent: 0,
        currentImageIndex: 0,
        totalImagesOnCurrentPost: 0,
        imagesEnabled: loadImages
    };

    for (let i = firstPage; i <= lastPage; i++) {
        throwIfCancelled(signal);

        const pageURL = getPageURL(baseURL, i);
        console.info(`Page loading: ${pageURL}`);

        const $page = await fetchPage(pageURL, signal);
        if (!$page) {
            stats.failedPages++;
            sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, null, title, stats);
            continue;
        }

        stats.loadedPages++;
        stats.pagePercent = 0;
        stats.imagePercent = 0;
        stats.currentImageIndex = 0;
        stats.totalImagesOnCurrentPost = 0;
        console.info(`Page ${i} loaded, fetching content...`);

        const blocks = $page(".message-inner").toArray();
        if (blocks.length === 0) {
            console.warn(`Page ${i}: No message blocks found`);
        }

        const totalBlocks = Math.max(blocks.length, 1);
        
        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
            const el = blocks[blockIndex];
            throwIfCancelled(signal);
            stats.pagePercent = Math.floor((blockIndex / totalBlocks) * 100);

            const name = $page(el)
                .find(".message-userDetails span[itemprop='name']")
                .text()
                .trim();

            // 💡 सुधार: अगर ऑथर मैच नहीं होता, तो पुरानी किसी पोस्ट का डेटा न भेजें (null भेजें)
            if (name !== authorName.trim()) {
                sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, null, title, stats);
                continue;
            }
            stats.authorMatches++;

            const article = $page(el).find("article.message-body");
            if (!article.length) continue;

            const $content = cheerio.load(article.html() || "");
            const imgs = $content("img").toArray();
            stats.totalImagesOnCurrentPost = loadImages ? imgs.length : 0;
            stats.currentImageIndex = 0;
            stats.imagePercent = loadImages && imgs.length ? 0 : 100;

            if (!loadImages) {
                $content("img").each((_, img) => {
                    const src = $content(img).attr("src");
                    if (src) $content(img).attr("src", new URL(src, pageURL).href);
                });
            }

            // 💡 मास्टरस्ट्रोक सुधार 1: 'currentPageHTML' को हटाकर 'currentPostHTML' किया
            // और यहाँ इसे $content.html() से सीधे इनिशियलाइज़ कर दिया।
            // इसका मतलब है कि अब इस वेरिएबल में सिर्फ और सिर्फ इसी एक सिंगल पोस्ट का HTML रहेगा!
            // cheerio के body टैग के अंदर जो कुछ भी है, सिर्फ वही निकालेगा
            let currentPostHTML = $content('body').html() + "<hr/>";

            // अब काउंटर को इमेज डाउनलोड करने से पहले ही बढ़ा दें, ताकि इमेज प्रोग्रेस के दौरान भी 
            // फ्रंटएंड को सही 'matchedPosts' (यूनीक पोस्ट नंबर) मिल सके।
            stats.matchedPosts++;

            for (let index = 0; loadImages && index < imgs.length; index++) {
                throwIfCancelled(signal);
                stats.currentImageIndex = index + 1;
                stats.imagePercent = 0;

                const img = imgs[index];
                const imgUrl = $content(img).attr("src");
                if (!imgUrl) continue;

                try {
                    const localPath = await downloadImageWithHash(
                        imgUrl,
                        baseFolder,
                        index + 1,
                        imgs.length,
                        pageURL,
                        signal,
                        (imageProgress) => {
                            stats.currentImageIndex = imageProgress.imageIndex;
                            stats.totalImagesOnCurrentPost = imageProgress.totalImages;
                            stats.imagePercent = imageProgress.imagePercent;
                            
                            // 💡 मास्टरस्ट्रोक सुधार 2: इमेज डाउनलोड होते समय सिर्फ इसी एक सिंगल पोस्ट का HTML लाइव जाएगा
                            sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, currentPostHTML, title, stats);
                        }
                    );

                    if (localPath) {
                        stats.downloadedImages++;
                        // DOM स्ट्रक्चर में इमेज पाथ अपडेट करें
                        $content(img).attr("src", `/temp/${localPath}`);
                        // अपडेटेड HTML को वेरिएबल में दोबारा सेव करें ताकि अगला इमेज कॉलबैक सही पाथ भेजे
                        currentPostHTML = $content('body').html() + "<hr/>";
                    } else {
                        stats.skippedImages++;
                    }
                } catch (err) {
                    if (err.code === "FETCH_CANCELLED" || err.name === "CanceledError") throw err;
                    stats.skippedImages++;
                    console.log(`Image skipped: ${imgUrl}`);
                }

                stats.imagePercent = 100;
                sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, currentPostHTML, title, stats);
            }

            $content("span").each((_, el) => {
                $content(el).removeAttr("style");
            });

            // स्टाइल हटाने के बाद फाइनल HTML री-फ्रेम करें
            currentPostHTML = $content('body').html() + "<hr/>";
            
            stats.pagePercent = Math.floor(((blockIndex + 1) / totalBlocks) * 100);
            
            // इस सिंगल पोस्ट का काम पूरा होने पर फ्रंटएंड को फाइनल अपडेट भेजें
            sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, currentPostHTML, title, stats);
            
            // 🧹 मेमोरी क्लीनअप असिस्टेंस
            currentPostHTML = null;
        }

        stats.pagePercent = 100;
        // पूरे पेज का लूप खत्म होने पर सिंक करने के लिए null भेजें ताकि कोई डुप्लीकेशन न हो
        sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, null, title, stats);
    }

    if (stats.loadedPages === 0) {
        throw createScrapeError("SITE_UNREACHABLE", "Site unreachable or no pages could be loaded");
    }
    if (stats.authorMatches === 0) {
        throw createScrapeError("AUTHOR_NOT_FOUND", "Author not found in selected pages");
    }
    if (stats.matchedPosts === 0) {
        throw createScrapeError("NO_STORY_POSTS", "No story posts found for this author");
    }

    console.log("Scraping complete.");
    return { title, stats };
}

function sendProgress(progressCallback, currentPage, firstPage, totalPages, totalPagesToFetch, html, title, stats) {
    if (!progressCallback) return;

    const payload = {
        percent: Math.floor(((currentPage - firstPage + 1) / totalPagesToFetch) * 100),
        overallPercent: Math.floor(((currentPage - firstPage + 1) / totalPagesToFetch) * 100),
        pagePercent: stats.pagePercent,
        imagePercent: stats.imagePercent,
        currentPage,
        totalPages,
        currentImageIndex: stats.currentImageIndex,
        totalImagesOnCurrentPost: stats.totalImagesOnCurrentPost,
        imagesEnabled: stats.imagesEnabled,
        matchedPosts: stats.matchedPosts,
        downloadedImages: stats.downloadedImages,
        skippedImages: stats.skippedImages,
        failedPages: stats.failedPages,
        checksum: html ? html.length : undefined,
        title
    };

    if (html !== null) {
        payload.html = html;
    }

    progressCallback(payload);
}

function getValidatedBaseURL(url) {
    if (!url || !url.trim()) {
        throw createScrapeError("URL_MISSING", "URL missing");
    }

    let parsed;
    try {
        parsed = new URL(url.trim());
    } catch (err) {
        throw createScrapeError("URL_INVALID", "Invalid URL");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw createScrapeError("URL_INVALID", "Only http and https URLs are allowed");
    }

    return getBaseURL(parsed.href);
}

function getBaseURL(url) {
    return url.replace(/\/page-\d+\/?$/, "").replace(/\/?$/, "/");
}

function getPageURL(baseURL, pageNumber) {
    return pageNumber === 1 ? baseURL : `${baseURL}page-${pageNumber}`;
}

async function fetchRequiredPage(url, signal) {
    const $ = await fetchPage(url, signal);
    if (!$) throw createScrapeError("SITE_UNREACHABLE", "Site unreachable or page could not be loaded");
    return $;
}

async function fetchPage(url, signal) {
    try {
        const { data } = await axios.get(url, {
            signal,
            timeout: 30000
        });
        return cheerio.load(data);
    } catch (err) {
        if (err.code === "ERR_CANCELED" || err.name === "CanceledError") {
            throw createScrapeError("FETCH_CANCELLED", "Fetch cancelled");
        }

        console.error(`Error fetching URL: ${url}\n`, err.message);
        return null;
    }
}

function getLastPage($) {
    let max = 1;
    $(".pageNav-main a").each((i, el) => {
        const num = parseInt($(el).text().trim(), 10);
        if (!Number.isNaN(num)) max = Math.max(max, num);
    });
    return max;
}

function throwIfCancelled(signal) {
    if (signal && signal.aborted) {
        throw createScrapeError("FETCH_CANCELLED", "Fetch cancelled");
    }
}

function createScrapeError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

module.exports = { getStoryMeta, scrapeStoryWithImages };