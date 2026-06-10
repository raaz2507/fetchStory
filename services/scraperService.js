const axios = require("axios");
const cheerio = require("cheerio");

const {
    getDomainConfig,
    recordUnsupportedDomain,
} = require("./domainService");
const { createImageCache, downloadImageWithHash } = require("./imageService");

async function getStoryMeta(originalURL) {
    const baseURL = getValidatedBaseURL(originalURL);
    const site = getSupportedSiteOrThrow(baseURL);
    const $firstPage = await fetchRequiredPage(baseURL);

    return {
        title: getTitle($firstPage, site.config),
        totalPages: getLastPage($firstPage, site.config),
        writerName: getWriterName($firstPage, site.config),
        domain: site.domain
    };
}

async function scrapeStoryWithImages(originalURL, authorName, baseFolder, progressCallback, options = {}) {
    const baseURL = getValidatedBaseURL(originalURL);
    const site = getSupportedSiteOrThrow(baseURL);
    const startPage = options.startPage || 0;
    const endPage = options.endPage || 0;
    const loadImages = options.loadImages !== false;
    const signal = options.signal;
    const publicBasePath = options.publicBasePath || "/temp";

    throwIfCancelled(signal);
    const imageCache = createImageCache();

    const $firstPage = await fetchRequiredPage(baseURL, signal);
    const title = getTitle($firstPage, site.config);
    const writerName = (authorName || "").trim() || getWriterName($firstPage, site.config);
    if (!writerName) {
        throw createScrapeError("AUTHOR_MISSING", "Author name missing");
    }

    const detectedLastPage = getLastPage($firstPage, site.config);
    const lastPage = endPage > 0 && endPage <= detectedLastPage ? endPage : detectedLastPage;
    const firstPage = startPage > 1 && startPage <= lastPage ? startPage : 1;
    const totalPagesToFetch = lastPage - firstPage + 1;

    const stats = {
        matchedPosts: 0,
        totalImages: 0,
        downloadedImages: 0,
        skippedImages: 0,
        authorMatches: 0,
        loadedPages: 0,
        failedPages: 0,
        pagePercent: 0,
        imagePercent: 0,
        currentImageIndex: 0,
        totalImagesOnCurrentPost: 0,
        imagesEnabled: loadImages,
        writerName
    };

    const processPostImages = async (imgs, $content, pageURL, currentPage) => {
        const imageProgressValues = new Array(imgs.length).fill(0);
        const imageConcurrency = Math.max(1, options.imageConcurrency || 1);

        await runLimited(
            imgs.map((img, index) => async () => {
                throwIfCancelled(signal);

                const imgUrl = $content(img).attr("src");
                if (!imgUrl) return;

                try {
                    const originalImageUrl = new URL(imgUrl, pageURL).href;
                    $content(img).attr("data-original-src", originalImageUrl);
                    const imageResult = await downloadImageWithHash(
                        originalImageUrl,
                        baseFolder,
                        index + 1,
                        imgs.length,
                        pageURL,
                        signal,
                        (imageProgress) => {
                            imageProgressValues[index] = imageProgress.imagePercent || 0;
                            stats.currentImageIndex = imageProgress.imageIndex;
                            stats.totalImagesOnCurrentPost = imageProgress.totalImages;
                            stats.imagePercent = getAveragePercent(imageProgressValues);

                            sendProgress(progressCallback, currentPage, firstPage, lastPage, totalPagesToFetch, null, title, stats);
                        },
                        imageCache
                    );
                    const localPath = imageResult && imageResult.localPath;

                    if (localPath) {
                        if (imageResult.wasDownloaded) {
                            stats.downloadedImages++;
                        } else if (imageResult.wasDuplicate) {
                            stats.skippedImages++;
                        }
                        $content(img).attr("src", `${publicBasePath}/${localPath}`);
                    } else {
                        stats.skippedImages++;
                    }
                } catch (err) {
                    if (err.code === "FETCH_CANCELLED" || err.name === "CanceledError") throw err;
                    stats.skippedImages++;
                    console.log(`Image skipped: ${imgUrl}`);
                }

                imageProgressValues[index] = 100;
                stats.imagePercent = getAveragePercent(imageProgressValues);
                sendProgress(progressCallback, currentPage, firstPage, lastPage, totalPagesToFetch, null, title, stats);
            }),
            imageConcurrency
        );
    };

    const processFetchedPage = async (i, pageURL, $page) => {
        if (!$page) {
            stats.failedPages++;
            sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, null, title, stats);
            return;
        }

        stats.loadedPages++;
        stats.pagePercent = 0;
        stats.imagePercent = 0;
        stats.currentImageIndex = 0;
        stats.totalImagesOnCurrentPost = 0;
        console.info(`Page ${i} loaded, fetching content...`);

        const articleBodies = findWriterPostBodies($page, writerName, site.config);
        if (articleBodies.length === 0) {
            console.warn(`Page ${i}: No message blocks found for ${writerName}`);
        }

        const totalBlocks = Math.max(articleBodies.length, 1);
        
        for (let blockIndex = 0; blockIndex < articleBodies.length; blockIndex++) {
            const articleBody = articleBodies[blockIndex];
            const articleHTML = typeof articleBody.bodyHTML === "string"
                ? articleBody.bodyHTML
                : $page(articleBody).html();
            throwIfCancelled(signal);
            stats.pagePercent = Math.floor((blockIndex / totalBlocks) * 100);

            stats.authorMatches++;

            const $content = cheerio.load(articleHTML || "");
            const imgs = $content("img").toArray();
            stats.totalImages += imgs.length;
            stats.totalImagesOnCurrentPost = loadImages ? imgs.length : 0;
            stats.currentImageIndex = 0;
            stats.imagePercent = loadImages && imgs.length ? 0 : 100;

            if (!loadImages) {
                $content("img").each((_, img) => {
                    const src = $content(img).attr("src");
                    if (src) $content(img).attr("src", new URL(src, pageURL).href);
                });
            }

            let currentPostHTML = $content('body').html() + "<hr/>";

            stats.matchedPosts++;

            if (loadImages && imgs.length) {
                await processPostImages(
                    imgs,
                    $content,
                    pageURL,
                    i
                );
                currentPostHTML = $content('body').html() + "<hr/>";
            }

            $content("span").each((_, el) => {
                $content(el).removeAttr("style");
            });

            currentPostHTML = $content('body').html() + "<hr/>";

            // 💡 बदलाव 2: यहाँ कलेक्ट होते समय आपके नए स्ट्रक्चर के अनुसार सेव होगा।
            // वर्तमान में स्क्रैप किया गया कन्टेंट 'eng' में जाएगा और 'hindi' अभी के लिए खाली रहेगा।
            stats.pagePercent = Math.floor(((blockIndex + 1) / totalBlocks) * 100);
            
            sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, currentPostHTML, title, stats);
            
            currentPostHTML = null;
        }

        stats.pagePercent = 100;
        sendProgress(progressCallback, i, firstPage, lastPage, totalPagesToFetch, null, title, stats);
    };

    for (const i of createPageNumbers(firstPage, lastPage)) {
        throwIfCancelled(signal);
        const pageURL = getPageURL(baseURL, i);
        console.info(`Page loading: ${pageURL}`);

        const $page = i === 1 ? $firstPage : await fetchPage(pageURL, signal);
        await processFetchedPage(i, pageURL, $page);
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
    
    return { 
        title, 
        stats
    };
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
        totalImages: stats.totalImages,
        failedPages: stats.failedPages,
        checksum: html ? html.length : undefined,
        writerName: stats.writerName,
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

    return getBaseURL(parsed.href, parsed.hostname.replace(/^www\./, "").toLowerCase());
}

function getBaseURL(url, domain) {
    if (domain === "xossipy.com") {
        return url.replace(/-page-\d+\.html$/i, ".html");
    }

    if (domain === "rajsharmastories.com") {
        const parsed = new URL(url);
        parsed.searchParams.delete("start");
        return parsed.href;
    }

    return url.replace(/\/page-\d+\/?$/, "").replace(/\/?$/, "/");
}

function getPageURL(baseURL, pageNumber) {
    if (baseURL.includes("xossipy.com/") && /\.html$/i.test(baseURL)) {
        return pageNumber === 1
            ? baseURL
            : baseURL.replace(/\.html$/i, `-page-${pageNumber}.html`);
    }

    if (baseURL.includes("rajsharmastories.com/") && baseURL.includes("viewtopic.php")) {
        const pageURL = new URL(baseURL);
        if (pageNumber === 1) {
            pageURL.searchParams.delete("start");
        } else {
            pageURL.searchParams.set("start", String((pageNumber - 1) * 5));
        }
        return pageURL.href;
    }

    return pageNumber === 1 ? baseURL : `${baseURL}page-${pageNumber}`;
}

function createPageNumbers(firstPage, lastPage) {
    const pages = [];
    for (let page = firstPage; page <= lastPage; page++) {
        pages.push(page);
    }
    return pages;
}

function createLimitedTaskMap(items, concurrency, worker) {
    const taskEntries = new Map();
    const promises = new Map();
    const queue = [...items];
    let activeCount = 0;

    const launchNext = () => {
        while (activeCount < concurrency && queue.length) {
            const item = queue.shift();
            const task = taskEntries.get(item);

            activeCount++;
            Promise.resolve()
                .then(() => worker(item))
                .then(task.resolve, task.reject)
                .finally(() => {
                    activeCount--;
                    launchNext();
                });
        }
    };

    items.forEach((item) => {
        let entry;
        const promise = new Promise((resolve, reject) => {
            entry = { resolve, reject };
        });
        promise.catch(() => {});
        taskEntries.set(item, entry);
        promises.set(item, promise);
    });

    launchNext();
    return promises;
}

async function runLimited(tasks, concurrency) {
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex++;
            await tasks[currentIndex]();
        }
    });

    await Promise.all(workers);
}

function getAveragePercent(values) {
    if (!values.length) return 100;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.floor(total / values.length);
}

function getSupportedSiteOrThrow(url) {
    const site = getDomainConfig(url);
    if (!site.config) {
        recordUnsupportedDomain(url);
        throw createScrapeError(
            "DOMAIN_NOT_SUPPORTED",
            `${site.domain} not supported yet`
        );
    }

    return site;
}

function getTitle($, config) {
    const titleSelector = config.title?.selector || config.titleSelector;
    const titlePosition = config.title?.position || config.titleSelectorPosition;
    const matches = $(titleSelector);
    const titleNode = titlePosition === "last"
        ? matches.last()
        : matches.first();

    return titleNode.text().trim();
}

function getWriterName($, config) {
    const writerSelector = config.writer?.selector || config.writerNameSelector;
    return $(writerSelector).first().text().trim();
}

function findWriterPostBodies($, writerName, config) {
    if (typeof config.customPostExtractor === "function") {
        return config.customPostExtractor($, writerName) || [];
    }

    if (config.posts) {
        return extractPosts($, config, writerName);
    }

    const directMatches = $(config.postBodySelector(writerName)).toArray();
    if (directMatches.length) return directMatches;

    const fallbackMatches = [];
    $(".message-inner").each((_, el) => {
        const name = $(el)
            .find(config.fallbackWriterSelector)
            .text()
            .trim();

        if (name !== writerName) return;

        const article = $(el)
            .find(config.fallbackPostSelector)
            .first();

        if (article.length) {
            fallbackMatches.push(article[0]);
        }
    });

    return fallbackMatches;
}

function extractPosts($, config, writerName) {
    const posts = [];
    const postConfig = config.posts;

    $(postConfig.containerSelector).each((index, el) => {
        const post = $(el);
        const authorName = getPostAuthorName(post, postConfig);

        if (normalizeName(authorName) !== normalizeName(writerName)) return;

        let postId = post.attr(postConfig.idAttribute) || null;

        if (postId && postConfig.idPrefix) {
            postId = postId.replace(postConfig.idPrefix, "");
        }

        const bodyHTML = post.find(postConfig.bodySelector).first().html()?.trim();

        if (!bodyHTML) return;

        posts.push({
            index: index + 1,
            postId,
            authorName,
            bodyHTML,
        });
    });

    return posts;
}

function getPostAuthorName(post, postConfig) {
    if (postConfig.authorAttribute) {
        return (post.attr(postConfig.authorAttribute) || "").trim();
    }

    return post
        .find(postConfig.authorSelector)
        .first()
        .text()
        .trim();
}

function normalizeName(name = "") {
    return name.toLowerCase().replace(/\s+/g, " ").trim();
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
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        "Referer": "https://xforum.live/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      }
    });

    return cheerio.load(data);
  } catch (err) {
    if (err.code === "ERR_CANCELED" || err.name === "CanceledError") {
      throw createScrapeError("FETCH_CANCELLED", "Fetch cancelled");
    }

    console.error(`Error fetching URL: ${url}\n`, err.response?.status, err.message);
    return null;
  }
}

function getLastPage($, config) {
    let max = 1;
    const lastPageSelector = config.pagination?.lastPageSelector || config.lastPageSelector;
    $(lastPageSelector).each((i, el) => {
        const num = parseInt($(el).text().trim(), 10);
        if (!Number.isNaN(num)) max = Math.max(max, num);

        const href = $(el).attr("href") || "";
        const hrefPageMatch = href.match(/(?:^|[-?&=\/])page[-=]?(\d+)(?:\.html)?/i);
        if (hrefPageMatch) {
            max = Math.max(max, parseInt(hrefPageMatch[1], 10));
        }
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
