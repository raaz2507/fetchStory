const path = require("path");
const fs = require("fs");
const fsAsync = require("fs").promises;

const { sanitizeFolderName } = require("../utils/fileUtils");
const { getStoryMeta, scrapeStoryWithImages } = require("../services/scraperService");
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
                    path.join(imageFolder, img)
                );
            });
            await Promise.all(copyPromises);
        }

        // 3. Temp में बनी लाइव 'story_data.json' को पढ़ें और कॉपी करें
        const sourceJsonPath = path.join(tempFolder, "story_data.json");
        if (!fs.existsSync(sourceJsonPath)) {
            return res.status(404).send("No story data found to download. Please fetch first.");
        }

        let originalJsonContent = fs.readFileSync(sourceJsonPath, "utf8");
        originalJsonContent = originalJsonContent.replace(/\/temp\/images\//g, "./images/");
        fs.writeFileSync(path.join(baseFolder, "story_data.json"), originalJsonContent);

        // 4. 💡 टेम्पलेट फ़ाइल को रीड करें और उसकी कॉपी डाउनलोड फ़ोल्डर में सेव करें 
        const templatePath = path.join(__dirname, "..", "templates", "reader_template.html");
        if (!fs.existsSync(templatePath)) {
            return res.status(500).send("HTML Template file missing on server. Create 'templates/reader_template.html' first.");
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
        await new Promise(resolve => setTimeout(resolve, 500)); // Buffer close safety timeout

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
                if (fs.existsSync(baseFolder)) fs.rmSync(baseFolder, { recursive: true, force: true });
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

        // 3. JSON का शुरुआती ढांचा
        const storyObj = {
            storyName: "Loading...",
            totalPage: 0, // यहाँ कुल वैलिड पोस्ट्स का काउंट रहेगा
            lastFetch: new Date().toISOString(),
            posts: {}
        };
        fs.writeFileSync(jsonFilePath, JSON.stringify(storyObj, null, 2));

        console.log("Starting scraper for URL:", url);

        // 💡 जादुई काउंटर: यह सिर्फ लेखक की असली पोस्ट मिलने पर ही बढ़ेगा (1, 2, 3...)
        let postCounter = 0;

        // 4. स्क्रैपर को रन करें
        await scrapeStoryWithImages(
            url,
            author,
            tempFolder, 
            (progressData) => {
                try {
                    // 💡 सिर्फ तभी JSON में लिखें जब प्रोग्रेस डेटा में असली HTML मौजूद हो और वह खाली न हो
                    if (progressData && progressData.html && progressData.html.trim() !== "") {
                        const currentJson = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
                        
                        currentJson.storyName = progressData.title || currentJson.storyName;
                        
                        // चेक करें कि क्या यह नया HTML कंटेंट पिछले सेव किए गए कंटेंट से अलग है 
                        // (ताकि इमेज डाउनलोड के दौरान एक ही पोस्ट बार-बार अलग नंबरों से सेव न हो)
                        const existingPostKeys = Object.keys(currentJson.posts);
                        const lastKey = existingPostKeys[existingPostKeys.length - 1];
                        
                        if (!lastKey || currentJson.posts[lastKey] !== progressData.html) {
                            // अगर यह नई पोस्ट है या अपडेटेड कंटेंट है, तो काउंटर बढ़ाएं या उसी पोस्ट को अपडेट करें
                            // स्क्रैपर के बीच में इमेज लोड होने पर प्रोग्रेस बार-बार आती है, इसलिए हमें करंट ब्लॉक ट्रैक करना होगा
                            
                            // एक आसान तरीका: हम चेक करते हैं कि क्या हम अभी भी उसी 'currentPage' पर हैं 
                            // या स्क्रैपर से कोई नया प्रोग्रेस ब्लॉक आया है।
                            // सुरक्षा के लिए: अगर स्क्रैपर में 'checksum' या html की लेंथ बदल रही है, तो हम उसी इंडेक्स को अपडेट करेंगे
                        }

                        // सबसे सुरक्षित तरीका: फोरम के पेज लूप के साथ तालमेल बिठाने के लिए:
                        // हम `progressData.html` को सीधे सेव करने के बजाय यह देखते हैं कि जब स्क्रैपर 
                        // `sendProgress` भेजता है, तो वह हर पोस्ट के खत्म होने पर भेजता है।
                        
                        // लेकिन बेहतर लॉजिक के लिए, आइए सीधे आपके काउंटर को मैनेज करें:
                        // हम स्क्रैपर के हर 'matchedPosts' काउंट को ही अपना की (Key) बना लेते हैं!
                        // क्योंकि स्क्रैपर के अंदर `stats.matchedPosts++` तभी होता है जब लेखक की पोस्ट मिलती है!
                        
                        if (progressData.matchedPosts > 0) {
                            const currentPostNum = progressData.matchedPosts; // 1, 2, 3... बिना किसी गैप के
                            
                            currentJson.posts[currentPostNum] = progressData.html;
                            currentJson.totalPage = Math.max(currentJson.totalPage, currentPostNum);
                        }
                        
                        fs.writeFileSync(jsonFilePath, JSON.stringify(currentJson, null, 2));
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
                signal: controller.signal
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
            res.write(`data: ${JSON.stringify({ error: getClientErrorMessage(err) })}\n\n`);
            res.end();
        }
    }
};

exports.getSinglePage = async (req, res) => {
    try {
        const pageNum = Number(req.query.page) || 1;
        const jsonFilePath = path.join(__dirname, "..", "temp", "story_data.json");

        if (!fs.existsSync(jsonFilePath)) {
            return res.status(404).json({ error: "Story data not found. Please scrape first." });
        }

        // फ़ाइल को रीड करें
        const fileContent = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
        
        // 💡 सेफ्टी चेक: अगर JSON में 'posts' ऑब्जेक्ट गायब हो या करंट नंबर न मिले
        if (!fileContent.posts || !fileContent.posts[pageNum]) {
            return res.status(404).json({ error: "Post not available yet" });
        }

        let pageHtml = fileContent.posts[pageNum];

        // इमेज पाथ फिक्सिंग (लाइव स्ट्रीमिंग रीडर के लिए)
        if (!pageHtml.includes('/temp/images/') && pageHtml.includes('src="images/')) {
            pageHtml = pageHtml.replace(/src="images\//g, 'src="/temp/images/');
        }

        // 💡 सुधार: चूँकि अब हमारे पास बिना किसी गैप के लगातार नंबर (1, 2, 3...) आ रहे हैं,
        // इसलिए अगला पेज तभी मौजूद माना जाएगा जब JSON के अंदर (pageNum + 1) वाली की (Key) मौजूद हो,
        // या फिर करंट नंबर कुल वैलिड पेज (totalPage) से छोटा हो, या कहानी अभी भी 'Loading...' स्टेट में हो।
        const hasNextPage = !!fileContent.posts[pageNum + 1] || 
                            pageNum < fileContent.totalPage || 
                            fileContent.storyName === "Loading...";

        // रिस्पॉन्स भेजें
        res.json({
            storyName: fileContent.storyName,
            page: pageNum,
            html: pageHtml,
            hasNextPage: hasNextPage 
        });

        // 🧹 मेमोरी क्लीनअप असिस्टेंस
        pageHtml = null;

    } catch (err) {
        console.error("Error in getSinglePage:", err);
        res.status(500).json({ error: "Error fetching page from server" });
    }
};

// 💡 यह एक हेल्पर फंक्शन है जो बैकएंड टर्मिनल में आपको दिखाएगा कि रैम कितनी बच रही है
function logMemoryUsage(page) {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`Page ${page} Written to JSON. Memory cleaned. Current RAM usage: ${Math.round(used * 100) / 100} MB`);
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
        console.log("Warning: Could not delete old temp files, skipping clean up:", err.message);
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
        URL_MISSING: "URL missing"
    };

    return messages[err.code] || err.message || "Scraping failed";
}