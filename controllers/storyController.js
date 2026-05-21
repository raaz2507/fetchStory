const path = require("path");
const fs = require("fs");
const { sanitizeFolderName } = require("../utils/fileUtils");
const { scrapeStoryWithImages } = require("../services/scraperService");
const { createZip } = require("../services/exportService");

exports.downloadStory = async (req, res) => {
    try {
        const { html = "", title = "story" } = req.body;

        const safeTitle = sanitizeFolderName(title) || "story";
        const baseFolder = path.join(__dirname, "..", "downloads", safeTitle);
        const imageFolder = path.join(baseFolder, "images");

        if (fs.existsSync(baseFolder)) {
            fs.rmSync(baseFolder, { recursive: true, force: true });
        }

        fs.mkdirSync(imageFolder, { recursive: true });

        const tempImagePath = path.join(__dirname, "..", "temp", "images");
        const images = fs.existsSync(tempImagePath) ? fs.readdirSync(tempImagePath) : [];

        images.forEach((img) => {
            fs.copyFileSync(
                path.join(tempImagePath, img),
                path.join(imageFolder, img)
            );
        });

        const updatedHTML = html.replace(/\/temp\/images\//g, "./images/");

        fs.writeFileSync(
            path.join(baseFolder, `${safeTitle}.html`),
            `<html><body>${updatedHTML}</body></html>`
        );

        const zipPath = path.join(__dirname, "..", "downloads", `${safeTitle}.zip`);
        await createZip(baseFolder, zipPath);

        res.download(zipPath);
    } catch (err) {
        console.error(err);
        res.status(500).send("Download failed");
    }
};

exports.streamStory = async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const { url, author } = req.query;
    const startPage = parsePositiveInteger(req.query.startPage);
    const endPage = parsePositiveInteger(req.query.endPage);

    try {
        await scrapeStoryWithImages(
            url,
            author,
            path.join(__dirname, "..", "temp"),
            (progressData) => {
                res.write(`data: ${JSON.stringify(progressData)}\n\n`);
            },
            startPage,
            endPage
        );

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (err) {
        console.error(err);
        res.write(`data: ${JSON.stringify({ error: "Scraping failed" })}\n\n`);
        res.end();
    }
};

function parsePositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
