const cheerio = require("cheerio");

const { createImageCache, downloadImageWithHash } = require("./imageService");

async function processStoryJsonImages(storyData, baseFolder, progressCallback, options = {}) {
    const story = normalizeStoryData(storyData);
    const sections = ["eng", "hindi"];
    const postQueue = sections.flatMap((sectionName) => {
        const posts = story.posts[sectionName];
        return Object.keys(posts)
            .sort((a, b) => Number(a) - Number(b))
            .map((postKey) => ({ sectionName, postKey }));
    });
    const stats = {
        totalImages: 0,
        downloadedImages: 0,
        skippedImages: 0,
        missingOriginalUrls: 0,
        processedPosts: 0,
        totalPosts: postQueue.length,
        processedImages: 0,
    };

    const imageCache = createImageCache();

    sendProgress(progressCallback, {
        ...stats,
        message: "Scanning uploaded JSON images",
        overallPercent: 0,
        pagePercent: 0,
        imagePercent: 0,
    });

    for (const item of postQueue) {
        throwIfAborted(options.signal);
        const posts = story.posts[item.sectionName];
        sendProgress(progressCallback, {
            ...stats,
            sectionName: item.sectionName,
            currentPostKey: item.postKey,
            message: `Processing post ${item.postKey}`,
            overallPercent: getPercent(stats.processedPosts, stats.totalPosts),
            pagePercent: 0,
            imagePercent: 0,
        });

        const result = await processHtmlImages(
            posts[item.postKey],
            baseFolder,
            stats,
            imageCache,
            options.signal,
            (imageProgress) => {
                sendProgress(progressCallback, {
                    ...stats,
                    ...imageProgress,
                    sectionName: item.sectionName,
                    currentPostKey: item.postKey,
                    message: `Processing post ${item.postKey}`,
                    overallPercent: getPercent(stats.processedPosts, stats.totalPosts),
                    pagePercent: getPercent(imageProgress.currentImageIndex || 0, imageProgress.totalImagesOnCurrentPost || 0),
                });
            }
        );
        posts[item.postKey] = result.html;
        stats.processedPosts++;

        sendProgress(progressCallback, {
            ...stats,
            sectionName: item.sectionName,
            currentPostKey: item.postKey,
            message: `Post ${item.postKey} processed`,
            overallPercent: getPercent(stats.processedPosts, stats.totalPosts),
            pagePercent: 100,
            imagePercent: 100,
        });
    }

    story["total-image"] = stats.totalImages;
    story["image-downlaods"] = stats.downloadedImages;
    story.lastFetch = new Date().toISOString();

    return { storyData: story, stats };
}

async function processHtmlImages(html, baseFolder, stats, imageCache, signal, progressCallback) {
    if (typeof html !== "string" || !html.includes("<img")) {
        return { html: html || "" };
    }

    const $ = cheerio.load(html, { decodeEntities: false });
    const images = $("img").toArray();
    stats.totalImages += images.length;

    for (let index = 0; index < images.length; index++) {
        throwIfAborted(signal);
        const img = images[index];
        const src = $(img).attr("src") || "";
        const dataOriginalSrc = $(img).attr("data-original-src") || "";
        const originalUrl = getDownloadableImageUrl(dataOriginalSrc) || getDownloadableImageUrl(src);

        if (!originalUrl) {
            stats.missingOriginalUrls++;
            stats.skippedImages++;
            stats.processedImages++;
            sendProgress(progressCallback, {
                currentImageIndex: index + 1,
                totalImagesOnCurrentPost: images.length,
                imagePercent: 100,
            });
            continue;
        }

        try {
            const imageResult = await downloadImageWithHash(
                originalUrl,
                baseFolder,
                index + 1,
                images.length,
                originalUrl,
                signal,
                (downloadProgress) => {
                    sendProgress(progressCallback, {
                        currentImageIndex: downloadProgress.imageIndex || index + 1,
                        totalImagesOnCurrentPost: downloadProgress.totalImages || images.length,
                        imagePercent: downloadProgress.imagePercent || 0,
                    });
                },
                imageCache
            );
            const localPath = imageResult && imageResult.localPath;

            if (!localPath) {
                stats.skippedImages++;
                stats.processedImages++;
                continue;
            }

            $(img).attr("src", localPath);
            $(img).attr("data-original-src", originalUrl);

            if (imageResult.wasDownloaded) {
                stats.downloadedImages++;
            }
            stats.processedImages++;
        } catch (err) {
            if (err.name === "AbortError") {
                throw err;
            }
            stats.skippedImages++;
            stats.processedImages++;
            console.log(`Uploaded JSON image skipped: ${originalUrl}`);
        } finally {
            sendProgress(progressCallback, {
                currentImageIndex: index + 1,
                totalImagesOnCurrentPost: images.length,
                imagePercent: 100,
            });
        }
    }

    return { html: $("body").html() || "" };
}

function getDownloadableImageUrl(value) {
    if (!value) return "";

    try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (err) {
        return "";
    }
}

function normalizeStoryData(storyData) {
    return {
        ...storyData,
        posts: {
            eng: storyData.posts && storyData.posts.eng ? storyData.posts.eng : {},
            hindi: storyData.posts && storyData.posts.hindi ? storyData.posts.hindi : {},
        },
    };
}

function getPercent(current, total) {
    if (!total) return 100;
    return Math.max(0, Math.min(100, Math.floor((current / total) * 100)));
}

function sendProgress(progressCallback, payload) {
    if (!progressCallback) return;
    progressCallback(payload);
}

function throwIfAborted(signal) {
    if (!signal || !signal.aborted) return;

    const err = new Error("Image processing cancelled");
    err.name = "AbortError";
    throw err;
}

module.exports = { processStoryJsonImages };
