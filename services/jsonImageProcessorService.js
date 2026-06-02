const cheerio = require("cheerio");

const { downloadImageWithHash, resetImageCache } = require("./imageService");

async function processStoryJsonImages(storyData, baseFolder) {
    const story = normalizeStoryData(storyData);
    const stats = {
        totalImages: 0,
        downloadedImages: 0,
        skippedImages: 0,
        missingOriginalUrls: 0,
    };

    resetImageCache();

    for (const sectionName of ["eng", "hindi"]) {
        const posts = story.posts[sectionName];
        const postKeys = Object.keys(posts).sort((a, b) => Number(a) - Number(b));

        for (const postKey of postKeys) {
            const result = await processHtmlImages(posts[postKey], baseFolder, stats);
            posts[postKey] = result.html;
        }
    }

    story["total-image"] = stats.totalImages;
    story["image-downlaods"] = stats.downloadedImages;
    story.lastFetch = new Date().toISOString();

    return { storyData: story, stats };
}

async function processHtmlImages(html, baseFolder, stats) {
    if (typeof html !== "string" || !html.includes("<img")) {
        return { html: html || "" };
    }

    const $ = cheerio.load(html, { decodeEntities: false });
    const images = $("img").toArray();
    stats.totalImages += images.length;

    for (let index = 0; index < images.length; index++) {
        const img = images[index];
        const src = $(img).attr("src") || "";
        const dataOriginalSrc = $(img).attr("data-original-src") || "";
        const originalUrl = getDownloadableImageUrl(dataOriginalSrc) || getDownloadableImageUrl(src);

        if (!originalUrl) {
            stats.missingOriginalUrls++;
            stats.skippedImages++;
            continue;
        }

        try {
            const imageResult = await downloadImageWithHash(
                originalUrl,
                baseFolder,
                index + 1,
                images.length,
                originalUrl
            );
            const localPath = imageResult && imageResult.localPath;

            if (!localPath) {
                stats.skippedImages++;
                continue;
            }

            $(img).attr("src", localPath);
            $(img).attr("data-original-src", originalUrl);

            if (imageResult.wasDownloaded) {
                stats.downloadedImages++;
            }
        } catch (err) {
            stats.skippedImages++;
            console.log(`Uploaded JSON image skipped: ${originalUrl}`);
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

module.exports = { processStoryJsonImages };
