const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { downloadImagesBatch , downloadImageWithHash} = require("./imageService");


async function scrapeStoryWithImages(originalURL, authorName, baseFolder, progressCallback) {

    if (!originalURL) throw new Error("URL missing");

    const baseURL = getBaseURL(originalURL);

    const $firstPage = await fetchPage(baseURL);

    const title = $firstPage(".p-title-value").text().trim();

    const lastPage = getLastPage($firstPage);

    let finalHTML = "";

    for (let i = 1; i <= lastPage; i++) {

        const pageURL = i === 1 ? baseURL : `${baseURL}page-${i}`;
        const $page = await fetchPage(pageURL);
        if (!$page) {
             console.warn(`Page ${i} could not be loaded, skipping...`);
            continue;
        }
        console.warn(`Page ${i} is loaded, fatching...`);
        
        const blocks = $page(".message-inner").toArray();
        if (blocks.length === 0) {
            console.warn(`Page ${i}: No message blocks found!`);
        }
        
        for (const el of blocks) {

            const name = $page(el)
                .find(".message-userDetails span[itemprop='name']")
                .text()
                .trim();

            if (name !== authorName) continue;

            const article = $page(el).find("article.message-body");
            if (!article.length) continue;

            const $content = cheerio.load(article.html());
            if (!$content) {
                console.warn(`Page ${i}, Block ${i}: Article content undefined`);
            }

            const imgs = $content("img").toArray();
            for (let index = 0; index < imgs.length; index++) {

                const img = imgs[index];
                const imgUrl = $content(img).attr("src");
                if (!imgUrl) continue;

                const localPath = await downloadImageWithHash(
                    imgUrl,
                    baseFolder,
                    index + 1,
                    imgs.length
                );

                // 🔥 यही असली fix है
                $content(img).attr("src", `/temp/${localPath}`);
            }
            finalHTML += $content.html() + "<hr/>";
        }

        // 🔥 Progress callback for SSE
        if (progressCallback) {
            progressCallback({
                percent: Math.floor((i / lastPage) * 100),
                currentPage: i,
                totalPages: lastPage,
                checksum: finalHTML.length,
                html: finalHTML
            });
        }
    }
    console.log(`Scraping complete. Total valid blocks fetched...`);
    return { html: finalHTML, title };
}

function getBaseURL(url) {
    return url.replace(/\/page-\d+\/?$/, '');
}

async function fetchPage(url) {
    try {
        const { data } = await axios.get(url);
        return cheerio.load(data);
    } catch (err) {
        console.error(`Error fetching URL: ${url}\n`, err.message);
        return null; // Return null if fetch fails
    }
}

function getLastPage($) {
    let max = 1;
    $(".pageNav-main a").each((i, el) => {
        const num = parseInt($(el).text().trim());
        if (!isNaN(num)) max = Math.max(max, num);
    });
    return max;
}

module.exports = { scrapeStoryWithImages };