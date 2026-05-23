const path = require("path");
const fs = require("fs");
const fsAsync = require("fs").promises;

const { sanitizeFolderName } = require("../utils/fileUtils");
const {
    getStoryMeta,
    scrapeStoryWithImages,
} = require("../services/scraperService");
const { createZip } = require("../services/exportService");

exports.downloadStory = async (req, res) => {
    try {
        const { title = "story" } = req.body;

        const safeTitle = sanitizeFolderName(title) || "story";
        const downloadsFolder = path.join(__dirname, "..", "downloads");
        const baseFolder = path.join(downloadsFolder, safeTitle);
        const imageFolder = path.join(baseFolder, "images");

        // 1. सुनिश्चित करें कि मुख्य downloads फोल्डर मौजूद हो
        if (!fs.existsSync(downloadsFolder)) {
            fs.mkdirSync(downloadsFolder, { recursive: true });
        }

        // पुराना डाउनलोड फोल्डर मौजूद है तो उसे साफ करें
        if (fs.existsSync(baseFolder)) {
            fs.rmSync(baseFolder, { recursive: true, force: true });
        }
        fs.mkdirSync(imageFolder, { recursive: true });

        // 2. Temp फोल्डर से असली इमेजेस को डाउनलोड फोल्डर में कॉपी करें
        const tempFolder = path.join(__dirname, "..", "temp");
        const tempImagePath = path.join(tempFolder, "images");

        if (fs.existsSync(tempImagePath)) {
            const images = fs.readdirSync(tempImagePath);
            const copyPromises = images.map((img) => {
                return fsAsync.copyFile(
                    path.join(tempImagePath, img),
                    path.join(imageFolder, img),
                );
            });
            await Promise.all(copyPromises);
        }

        // 3. Temp में बनी लाइव 'story_data.json' को पढ़ें और कॉपी करें
        const sourceJsonPath = path.join(tempFolder, "story_data.json");
        if (!fs.existsSync(sourceJsonPath)) {
            return res
                .status(404)
                .send("No story data found to download. Please fetch first.");
        }

        let originalJsonContent = fs.readFileSync(sourceJsonPath, "utf8");
        originalJsonContent = originalJsonContent.replace(
            /\/temp\/images\//g,
            "./images/",
        );
        fs.writeFileSync(
            path.join(baseFolder, "story_data.json"),
            originalJsonContent,
        );

        // 4. टेम्पलेट फ़ाइल को रीड करें और उसकी कॉपी डाउनलोड फ़ोल्डर में सेव करें
        const templatePath = path.join(
            __dirname,
            "..",
            "templates",
            "reader_template.html",
        );
        if (!fs.existsSync(templatePath)) {
            return res
                .status(500)
                .send(
                    "HTML Template file missing on server. Create 'templates/reader_template.html' first.",
                );
        }

        // टेम्पलेट फ़ाइल को टेक्स्ट की तरह पढ़ें
        let htmlTemplate = fs.readFileSync(templatePath, "utf8");

        // टाइटल को डायनामिकली रिप्लेस कर दें
        htmlTemplate = htmlTemplate.replace(/__STORY_TITLE__/g, safeTitle);

        // इसे यूज़र के स्पेसिफिक डाउनलोड फ़ोल्डर में 'index.html' नाम से सेव कर दें
        fs.writeFileSync(path.join(baseFolder, "index.html"), htmlTemplate);

        // 5. ज़िप फ़ाइल का निर्माण और ट्रांसफर
        const zipPath = path.join(downloadsFolder, `${safeTitle}.zip`);
        console.log("Creating zip archive...");

        await createZip(baseFolder, zipPath);
        await new Promise((resolve) => setTimeout(resolve, 500)); // Buffer close safety timeout

        if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
            throw new Error("Zip creation failed or file is 0 bytes.");
        }

        // 6. फ़ाइल सेंड करें और क्लीनअप करें
        res.download(zipPath, `${safeTitle}.zip`, (err) => {
            if (err) {
                console.error("Error during file transfer:", err);
            }

            // क्लीनअप बैकग्राउंड में स्टोरेज खाली करने के लिए
            try {
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                if (fs.existsSync(baseFolder))
                    fs.rmSync(baseFolder, { recursive: true, force: true });
                console.log("Storage clean up done successfully.");
            } catch (cleanErr) {
                console.error("Cleanup warning:", cleanErr.message);
            }
        });
    } catch (err) {
        console.error("Download Error:", err);
        if (!res.headersSent) {
            res.status(500).send("Download failed: " + err.message);
        }
    }
};

exports.storyMeta = async (req, res) => {
    try {
        const meta = await getStoryMeta(req.query.url);
        res.json(meta);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: getClientErrorMessage(err) });
    }
};

exports.streamStory = async (req, res) => {
    // 1. SSE Headers सेट करें
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const controller = new AbortController();
    req.on("close", () => {
        console.log("Client closed connection, aborting...");
        controller.abort();
    });

    const { url, author } = req.query;
    const startPage = parsePositiveInteger(req.query.startPage) || 1;
    const endPage = parsePositiveInteger(req.query.endPage) || 0;
    const loadImages = req.query.loadImages !== "0";

    const tempFolder = path.join(__dirname, "..", "temp");
    const jsonFilePath = path.join(tempFolder, "story_data.json");

    try {
        // 2. पुराने फाइलों को साफ़ करें
        cleanTempFolder();

        // 3. JSON का शुरुआती ढांचा आपके नए फॉर्मेट (eng और hindi) के अनुसार सेट किया
        const storyObj = {
            storyName: "Loading...",
            totalPage: 0,
            lastFetch: new Date().toISOString(),
            posts: {
                eng: {},
                hindi: {},
            },
        };
        fs.writeFileSync(jsonFilePath, JSON.stringify(storyObj, null, 2));

        console.log("Starting scraper for URL:", url);

        // 4. स्क्रैपर को रन करें
        await scrapeStoryWithImages(
            url,
            author,
            tempFolder,
            (progressData) => {
                try {
                    if (progressData) {
                        // हर बार फाइल को सुरक्षित रीड करें
                        let currentJson;
                        try {
                            currentJson = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
                        } catch (e) {
                            currentJson = { storyName: "Loading...", totalPage: 0, posts: { eng: {}, hindi: {} } };
                        }

                        // ढांचा सुनिश्चित करें (Safety Check)
                        if (!currentJson.posts) currentJson.posts = { eng: {}, hindi: {} };
                        if (!currentJson.posts.eng) currentJson.posts.eng = {};
                        if (!currentJson.posts.hindi) currentJson.posts.hindi = {};

                        // कहानी का नाम अपडेट करें
                        currentJson.storyName = progressData.title || progressData.storyName || currentJson.storyName;

                        // 🚨 [सुधार]: सुपर डायनामिक कन्टेंट डिटेक्टर (matchedPosts पर निर्भरता खत्म)
                        let contentHtml = progressData.html || progressData.content || (progressData.post ? progressData.post.html : null);

                        if (contentHtml && contentHtml.trim() !== "") {
                            // पोस्ट का नंबर तय करें (अगर matchedPosts 0 या मिसिंग है, तो JSON की लेंथ से इंडेक्स ऑटो-इन्क्रीमेंट करें)
                            let currentPostNum = progressData.matchedPosts || progressData.currentPage || progressData.page;
                            if (!currentPostNum || currentPostNum === 0) {
                                currentPostNum = Object.keys(currentJson.posts.eng).length + 1;
                            }

                            // डेटा असाइन करें
                            currentJson.posts.eng[currentPostNum] = contentHtml;
                            currentJson.posts.hindi[currentPostNum] = currentJson.posts.hindi[currentPostNum] || "";
                            
                            currentJson.totalPage = Math.max(currentJson.totalPage, Number(currentPostNum));

                            // फाइल में डेटा फ़ोर्स राइट करें
                            fs.writeFileSync(
                                jsonFilePath,
                                JSON.stringify(currentJson, null, 2),
                            );
                            console.log(`📝 [JSON UPDATED] Part ${currentPostNum} successfully saved to story_data.json`);
                        } else {
                            console.log("⚠️ Progress received, but no valid HTML content found.");
                        }
                    }
                } catch (writeErr) {
                    console.error("Error writing post to JSON:", writeErr.message);
                }

                // फ्रंटएंड को लाइव डेटा भेजें
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify(progressData)}\n\n`);
                }
            },
            {
                startPage,
                endPage,
                loadImages,
                signal: controller.signal,
            }
        );

        // 5. काम पूरा होने पर 'done' भेजें
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        }
    } catch (err) {
        console.error("=== CRITICAL SCRAPER ERROR ===");
        console.error(err);
        console.error("==============================");

        if (!res.writableEnded) {
            res.write(
                `data: ${JSON.stringify({ error: getClientErrorMessage(err) })}\n\n`,
            );
            res.end();
        }
    }
};

exports.getSinglePage = async (req, res) => {
    try {
        const pageNum = Number(req.query.page) || 1;
        const jsonFilePath = path.join(__dirname, "..", "temp", "story_data.json");

        if (!fs.existsSync(jsonFilePath)) {
            return res
                .status(404)
                .json({ error: "Story data not found. Please scrape first." });
        }

        // फ़ाइल को रीड करें
        const fileContent = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

        if (
            !fileContent.posts ||
            !fileContent.posts.eng ||
            !fileContent.posts.eng[pageNum]
        ) {
            return res.status(404).json({ error: "Post not available yet" });
        }

        let pageHtml = fileContent.posts.eng[pageNum];

        // इमेज पाथ फिक्सिंग (लाइव स्ट्रीमिंग रीडर के लिए)
        if (
            !pageHtml.includes("/temp/images/") &&
            pageHtml.includes('src="images/')
        ) {
            pageHtml = pageHtml.replace(/src="images\//g, 'src="/temp/images/');
        }

        const hasNextPage =
            !!fileContent.posts.eng[pageNum + 1] ||
            pageNum < fileContent.totalPage ||
            fileContent.storyName === "Loading...";

        // रिस्पॉन्स भेजें
        res.json({
            storyName: fileContent.storyName,
            page: pageNum,
            html: pageHtml,
            hasNextPage: hasNextPage,
        });

        pageHtml = null;
    } catch (err) {
        console.error("Error in getSinglePage:", err);
        res.status(500).json({ error: "Error fetching page from server" });
    }
};

function logMemoryUsage(page) {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(
        `Page ${page} Written to JSON. Memory cleaned. Current RAM usage: ${Math.round(used * 100) / 100} MB`,
    );
}

function cleanTempFolder() {
    const tempPath = path.join(__dirname, "..", "temp");
    const imagesPath = path.join(tempPath, "images");
    const jsonFilePath = path.join(tempPath, "story_data.json");

    try {
        if (fs.existsSync(imagesPath)) {
            fs.rmSync(imagesPath, { recursive: true, force: true });
        }
        if (fs.existsSync(jsonFilePath)) {
            fs.rmSync(jsonFilePath, { force: true });
        }
    } catch (err) {
        console.log(
            "Warning: Could not delete old temp files, skipping clean up:",
            err.message,
        );
    }

    fs.mkdirSync(imagesPath, { recursive: true });
}

function parsePositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getClientErrorMessage(err) {
    const messages = {
        AUTHOR_MISSING: "Author name missing",
        AUTHOR_NOT_FOUND: "Author not found in selected pages",
        FETCH_CANCELLED: "Fetch cancelled",
        NO_STORY_POSTS: "No story posts found for this author",
        SITE_UNREACHABLE: "Site unreachable or page could not be loaded",
        URL_INVALID: "Invalid URL",
        URL_MISSING: "URL missing",
    };

    return messages[err.code] || err.message || "Scraping failed";
}