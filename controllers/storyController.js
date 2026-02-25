const path = require("path");
const fs = require("fs");
const { sanitizeFolderName } = require("../utils/fileUtils");
const { scrapeStoryWithImages } = require("../services/scraperService");
const { createZip } = require("../services/exportService");

exports.downloadStory = async (req, res) => {
    try {
        const { html, title } = req.body;

        const safeTitle = sanitizeFolderName(title);
        const baseFolder = path.join(__dirname, "..", "downloads", safeTitle);
        const imageFolder = path.join(baseFolder, "images");

        if (fs.existsSync(baseFolder)) {
            fs.rmSync(baseFolder, { recursive: true, force: true });
        }

        fs.mkdirSync(imageFolder, { recursive: true });

        // 🔥 1️⃣ temp से image copy करो
        const tempPath = path.join(__dirname, "..", "temp");
        const images = fs.readdirSync(tempPath);

        images.forEach(img => {
            fs.copyFileSync(
                path.join(tempPath, img),
                path.join(imageFolder, img)
            );
        });

        // 🔥 2️⃣ HTML में path replace करो
        const updatedHTML = html.replace(/\/temp\//g, "./images/");

        fs.writeFileSync(
            path.join(baseFolder, `${safeTitle}.html`),
            `<html><body>${updatedHTML}</body></html>`
        );

        // 🔥 3️⃣ Zip बनाओ
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

    try {
        const result = await scrapeStoryWithImages(
            url,
            author,
            "./temp",
            (progressData) => {

                res.write(`data: ${JSON.stringify(progressData)}\n\n`);
            }
        );

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();

    } catch (err) {
        console.error(err);
        res.write(`data: ${JSON.stringify({ error: "Scraping failed" })}\n\n`);
        res.end();
    }
};