const axios = require("axios");
const cheerio = require("cheerio");

const { downloadImageWithHash } = require("./imageService");

async function scrapeStoryWithImages(originalURL, authorName, baseFolder, progressCallback, startPage = 0, endPage = 0) {
    if (!originalURL) throw new Error("URL missing");

    const baseURL = getBaseURL(originalURL);
    const $firstPage = await fetchPage(baseURL);
    if (!$firstPage) throw new Error("First page could not be loaded");

    const title = $firstPage(".p-title-value").text().trim();
    const detectedLastPage = getLastPage($firstPage);
    const lastPage = endPage > 0 && endPage <= detectedLastPage ? endPage : detectedLastPage;
    const firstPage = startPage > 1 && startPage <= lastPage ? startPage : 1;
    const totalPagesToFetch = lastPage - firstPage + 1;

    let finalHTML = "";

    for (let i = firstPage; i <= lastPage; i++) {
        const pageURL = getPageURL(baseURL, i);
        console.info(`Page loading: ${pageURL}`);

        const $page = await fetchPage(pageURL);
        if (!$page) {
            console.warn(`Page ${i} could not be loaded, skipping...`);
            continue;
        }

        console.info(`Page ${i} loaded, fetching content...`);

        const blocks = $page(".message-inner").toArray();
        if (blocks.length === 0) {
            console.warn(`Page ${i}: No message blocks found`);
        }

        for (const el of blocks) {
            const name = $page(el)
                .find(".message-userDetails span[itemprop='name']")
                .text()
                .trim();

            if (name !== authorName) continue;

            const article = $page(el).find("article.message-body");
            if (!article.length) continue;

            const $content = cheerio.load(article.html() || "");
            const imgs = $content("img").toArray();

            for (let index = 0; index < imgs.length; index++) {
                const img = imgs[index];
                const imgUrl = $content(img).attr("src");
                if (!imgUrl) continue;

                try {
                    const localPath = await downloadImageWithHash(
                        imgUrl,
                        baseFolder,
                        index + 1,
                        imgs.length,
                        pageURL
                    );

                    if (localPath) {
                        $content(img).attr("src", `/temp/${localPath}`);
                    }
                } catch (err) {
                    console.log(`Image skipped: ${imgUrl}`);
                }
            }

            $content("span").each((_, el) => {
                $content(el).removeAttr("style");
            });

            finalHTML += $content.html() + "<hr/>";
        }

        if (progressCallback) {
            progressCallback({
                percent: Math.floor(((i - firstPage + 1) / totalPagesToFetch) * 100),
                currentPage: i,
                totalPages: lastPage,
                checksum: finalHTML.length,
                html: finalHTML,
                title
            });
        }
    }

    console.log("Scraping complete.");
    return { html: finalHTML, title };
}

function getBaseURL(url) {
    return url.replace(/\/page-\d+\/?$/, "").replace(/\/?$/, "/");
}

function getPageURL(baseURL, pageNumber) {
    return pageNumber === 1 ? baseURL : `${baseURL}page-${pageNumber}`;
}

async function fetchPage(url) {
    try {
        const { data } = await axios.get(url);
        return cheerio.load(data);
    } catch (err) {
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

module.exports = { scrapeStoryWithImages };
