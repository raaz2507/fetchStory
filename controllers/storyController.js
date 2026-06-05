const path = require("path");
const fs = require("fs");
const fsAsync = require("fs").promises;
const crypto = require("crypto");

const { sanitizeFolderName } = require("../utils/fileUtils");
const {
    getStoryMeta,
    scrapeStoryWithImages,
} = require("../services/scraperService");
const { createZip } = require("../services/exportService");
const { processStoryJsonImages } = require("../services/jsonImageProcessorService");
const { logMemory } = require("../utils/logger");

exports.downloadStory = async (req, res) => {
    try {
        const { title = "story" } = req.body;
        const jobId = getValidJobId(req.body && req.body.jobId);

        const safeTitle = sanitizeFolderName(title) || "story";
        const downloadsFolder = path.join(__dirname, "..", "downloads");
        const baseFolder = path.join(downloadsFolder, `${safeTitle}-${jobId}`);
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
        const tempFolder = getJobFolder(jobId);
        const tempImagePath = path.join(tempFolder, "images");

        if (fs.existsSync(tempImagePath)) {
            const images = fs.readdirSync(tempImagePath);
            await copyFilesInBatches(images, 10, async (img) => {
                await fsAsync.copyFile(
                    path.join(tempImagePath, img),
                    path.join(imageFolder, img)
                );
            });
        }

        // 3. Temp में बनी लाइव 'story_data.json' को पढ़ें और कॉपी करें
        const sourceJsonPath = path.join(tempFolder, "story_data.json");
        if (!fs.existsSync(sourceJsonPath)) {
            return res
                .status(404)
                .send("No story data found to download. Please fetch first.");
        }

        let originalJsonContent = fs.readFileSync(sourceJsonPath, "utf8");
        originalJsonContent = originalJsonContent
            .replace(new RegExp(`/temp/jobs/${escapeRegExp(jobId)}/images/`, "g"), "images/")
            .replace(/\/temp\/images\//g, "images/");
        fs.writeFileSync(
            path.join(baseFolder, "story_data.json"),
            originalJsonContent,
        );
        // 4. टेम्पलेट फ़ाइल को रीड करें और उसकी कॉपी डाउनलोड फ़ोल्डर में सेव करें
        // टेम्पलेट फ़ाइल को टेक्स्ट की तरह पढ़ें
        // टाइटल को डायनामिकली रिप्लेस कर दें
        // इसे यूज़र के स्पेसिफिक डाउनलोड फ़ोल्डर में 'index.html' नाम से सेव कर दें
        // 5. ज़िप फ़ाइल का निर्माण और ट्रांसफर
        const zipPath = path.join(downloadsFolder, `${safeTitle}-${jobId}.zip`);
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
            res.status(err.statusCode || 500).send("Download failed: " + err.message);
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

exports.uploadStoryJson = async (req, res) => {
    try {
        const uploadedData = req.body && req.body.storyData;
        if (!uploadedData || typeof uploadedData !== "object" || Array.isArray(uploadedData)) {
            return res.status(400).json({ error: "Valid JSON story data missing" });
        }

        const jobId = createJobId();
        const tempFolder = getJobFolder(jobId);
        const imagesPath = path.join(tempFolder, "images");
        const jsonFilePath = path.join(tempFolder, "story_data.json");

        fs.mkdirSync(imagesPath, { recursive: true });

        const storyData = normalizeStoryData(uploadedData);
        writeStoryDataFile(jsonFilePath, storyData);

        res.json({
            ok: true,
            jobId,
            storyData,
            meta: createStorySummary(storyData),
        });
    } catch (err) {
        console.error("JSON upload error:", err);
        res.status(500).json({ error: "JSON upload failed" });
    }
};

exports.cleanUploadedStoryJson = async (req, res) => {
    try {
        const jobId = getValidJobId(req.body && req.body.jobId);
        const tempFolder = getJobFolder(jobId);
        const jsonFilePath = path.join(tempFolder, "story_data.json");

        if (!fs.existsSync(jsonFilePath)) {
            return res.status(404).json({ error: "Upload JSON first" });
        }

        const storyData = normalizeStoryData(
            JSON.parse(fs.readFileSync(jsonFilePath, "utf8"))
        );
        writeStoryDataFile(jsonFilePath, storyData);

        res.json({
            ok: true,
            jobId,
            storyData,
            meta: createStorySummary(storyData),
        });
    } catch (err) {
        console.error("Uploaded JSON clean error:", err);
        res.status(err.statusCode || 500).json({ error: "JSON clean failed: " + err.message });
    }
};

exports.processUploadedStoryImages = async (req, res) => {
    try {
        const jobId = getValidJobId(req.body && req.body.jobId);
        const tempFolder = getJobFolder(jobId);
        const imagesPath = path.join(tempFolder, "images");
        const jsonFilePath = path.join(tempFolder, "story_data.json");

        if (!fs.existsSync(jsonFilePath)) {
            return res.status(404).json({ error: "Upload JSON first" });
        }

        fs.mkdirSync(imagesPath, { recursive: true });

        const storyData = normalizeStoryData(
            JSON.parse(fs.readFileSync(jsonFilePath, "utf8"))
        );
        const result = await processStoryJsonImages(storyData, tempFolder);

        writeStoryDataFile(jsonFilePath, result.storyData);

        res.json({
            ok: true,
            jobId,
            storyData: result.storyData,
            meta: createStorySummary(result.storyData),
            stats: result.stats,
        });
    } catch (err) {
        console.error("Uploaded JSON image processing error:", err);
        res.status(err.statusCode || 500).json({ error: "Image processing failed: " + err.message });
    }
};

exports.streamUploadedStoryImages = async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const controller = new AbortController();
    res.on("error", (err) => {
        console.error("Uploaded image stream response error:", err.message);
        controller.abort();
    });
    req.on("close", () => {
        controller.abort();
    });

    try {
        const jobId = getValidJobId(req.query && req.query.jobId);
        const tempFolder = getJobFolder(jobId);
        const imagesPath = path.join(tempFolder, "images");
        const jsonFilePath = path.join(tempFolder, "story_data.json");

        if (!fs.existsSync(jsonFilePath)) {
            writeSseEvent(res, { error: "Upload JSON first", jobId }, controller);
            return res.end();
        }

        fs.mkdirSync(imagesPath, { recursive: true });

        const storyData = normalizeStoryData(
            JSON.parse(fs.readFileSync(jsonFilePath, "utf8"))
        );
        const result = await processStoryJsonImages(
            storyData,
            tempFolder,
            (progressData) => {
                if (controller.signal.aborted) return;
                writeSseEvent(res, { ...progressData, jobId }, controller);
            },
            { signal: controller.signal }
        );

        writeStoryDataFile(jsonFilePath, result.storyData);

        if (writeSseEvent(res, {
            done: true,
            jobId,
            storyData: result.storyData,
            meta: createStorySummary(result.storyData),
            stats: result.stats,
        }, controller)) {
            res.end();
        }
    } catch (err) {
        console.error("Uploaded JSON image processing stream error:", err);
        if (writeSseEvent(res, { error: "Image processing failed: " + err.message }, controller)) {
            res.end();
        }
    }
};

exports.streamStory = async (req, res) => {
    // 1. SSE Headers सेट करें
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const controller = new AbortController();
    res.on("error", (err) => {
        console.error("Story stream response error:", err.message);
        controller.abort();
    });
    req.on("close", () => {
        console.log("Client closed connection, aborting...");
        controller.abort();
    });

    const { url, author } = req.query;
    const requestedStartPage = parsePositiveInteger(req.query.startPage) || 1;
    const endPage = parsePositiveInteger(req.query.endPage) || 0;
    const loadImages = req.query.loadImages !== "0";
    const appendMode = req.query.append === "1";
    const requestedJobId = req.query.jobId ? getValidJobId(req.query.jobId) : "";
    const jobId = appendMode && requestedJobId ? requestedJobId : createJobId();

    const tempFolder = getJobFolder(jobId);
    const imagesPath = path.join(tempFolder, "images");
    const jsonFilePath = path.join(tempFolder, "story_data.json");
    const startedAt = new Date();
    let writeStoryJson = null;

    try {
        const existingStoryData = appendMode ? readExistingStoryData(jsonFilePath) : null;
        const effectiveAppendMode = appendMode && existingStoryData && isSameStorySource(existingStoryData.url, url);
        const resumePage = effectiveAppendMode ? Number(existingStoryData["last-page-no"] || 0) : 0;
        const startPage = effectiveAppendMode && resumePage > 0 ? resumePage : requestedStartPage;

        // 2. पुराने फाइलों को साफ़ करें
        if (effectiveAppendMode) {
            fs.mkdirSync(imagesPath, { recursive: true });
        } else {
            cleanTempFolder(tempFolder);
        }

        // 3. JSON का शुरुआती ढांचा आपके नए फॉर्मेट (eng और hindi) के अनुसार सेट किया
        const storyObj = effectiveAppendMode ? existingStoryData : createStoryDataShell(url, author, startedAt);
        ensureStoryDataMeta(storyObj, url, author, startedAt);
        storyObj["start-time"] = startedAt.toISOString();
        storyObj["end time"] = "";
        storyObj["duration taken"] = "";
        storyObj.lastFetch = startedAt.toISOString();
        writeStoryDataFile(jsonFilePath, storyObj);
        let liveStoryJson = storyObj;

        console.log("Starting scraper for URL:", url);
        logMemory("story stream started");
        const postNumberMap = new Map();
        const postImageCountMap = new Map();
        const knownPostNumbers = new Set(Object.keys(storyObj.posts.eng));
        for (const postNumber of knownPostNumbers) {
            postImageCountMap.set(postNumber, countImagesInHtml(storyObj.posts.eng[postNumber]));
        }
        let livePostCount = knownPostNumbers.size;
        let liveTotalImages = [...postImageCountMap.values()].reduce((total, count) => total + count, 0);
        let lastKnownPage = Number(storyObj["last-page-no"] || 0);
        let nextPostNumber = getNextPostNumber(storyObj.posts.eng);
        const baseDownloadedImages = effectiveAppendMode ? Number(existingStoryData["image-downlaods"] || 0) : 0;
        writeStoryJson = createJsonWriteBuffer(jsonFilePath);

        // 4. स्क्रैपर को रन करें
        await scrapeStoryWithImages(
            url,
            author,
            tempFolder,
            (progressData) => {
                let shouldWriteStoryJson = false;
                try {
                    if (progressData) {
                        // हर बार फाइल को सुरक्षित रीड करें
                        let currentJson = liveStoryJson;

                        // ढांचा सुनिश्चित करें (Safety Check)
                        if (!currentJson.posts) currentJson.posts = { eng: {}, hindi: {} };
                        if (!currentJson.posts.eng) currentJson.posts.eng = {};
                        if (!currentJson.posts.hindi) currentJson.posts.hindi = {};
                        ensureStoryDataMeta(currentJson, url, author, startedAt);

                        // कहानी का नाम अपडेट करें
                        currentJson.storyName = progressData.title || progressData.storyName || currentJson.storyName;
                        currentJson["writer-name"] = progressData.writerName || currentJson["writer-name"];
                        currentJson.totalPage = progressData.totalPages || currentJson.totalPage;
                        currentJson.lastFetch = new Date().toISOString();
                        currentJson["total-image"] = progressData.totalImages || currentJson["total-image"] || 0;
                        currentJson["image-downlaods"] = baseDownloadedImages + (progressData.downloadedImages || 0);
                        progressData.downloadedImages = currentJson["image-downlaods"];
                        if (progressData.currentPage && progressData.currentPage !== lastKnownPage) {
                            lastKnownPage = progressData.currentPage;
                            shouldWriteStoryJson = lastKnownPage % 25 === 0;
                        }
                        currentJson["last-page-no"] = lastKnownPage || currentJson["last-page-no"] || 0;

                        // 🚨 [सुधार]: सुपर डायनामिक कन्टेंट डिटेक्टर (matchedPosts पर निर्भरता खत्म)
                        let contentHtml = progressData.html || progressData.content || (progressData.post ? progressData.post.html : null);

                        if (contentHtml && contentHtml.trim() !== "") {
                            // पोस्ट का नंबर तय करें (अगर matchedPosts 0 या मिसिंग है, तो JSON की लेंथ से इंडेक्स ऑटो-इन्क्रीमेंट करें)
                            const localPostNum = progressData.matchedPosts || progressData.currentPage || progressData.page;
                            let currentPostNum = postNumberMap.get(localPostNum);

                            if (!currentPostNum) {
                                currentPostNum = nextPostNumber++;
                                postNumberMap.set(localPostNum, currentPostNum);
                            }

                            // डेटा असाइन करें
                            const currentPostKey = String(currentPostNum);
                            const postHtmlChanged = currentJson.posts.eng[currentPostKey] !== contentHtml;
                            currentJson.posts.eng[currentPostKey] = contentHtml;
                            if (!knownPostNumbers.has(currentPostKey)) {
                                knownPostNumbers.add(currentPostKey);
                                livePostCount++;
                                shouldWriteStoryJson = true;
                            }
                            const previousImageCount = postImageCountMap.get(currentPostKey) || 0;
                            const nextImageCount = countImagesInHtml(contentHtml);
                            postImageCountMap.set(currentPostKey, nextImageCount);
                            liveTotalImages += nextImageCount - previousImageCount;
                            progressData.currentPostNum = Number(currentPostNum);
                            progressData.matchedPosts = livePostCount;
                            currentJson["total-image"] = liveTotalImages;
                            progressData.totalImages = currentJson["total-image"];
                            // फाइल में डेटा फ़ोर्स राइट करें
                            if (postHtmlChanged) {
                                shouldWriteStoryJson = true;
                                console.log(`📝 [JSON UPDATED] Part ${currentPostNum} successfully saved to story_data.json`);
                            } else {
                                delete progressData.html;
                            }
                        } else {
                            console.log("⚠️ Progress received, but no valid HTML content found.");
                        }
                        liveStoryJson = currentJson;
                        if (shouldWriteStoryJson) {
                            writeStoryJson(liveStoryJson);
                        }
                    }
                } catch (writeErr) {
                    console.error("Error writing post to JSON:", writeErr.message);
                }

                // फ्रंटएंड को लाइव डेटा भेजें
                if (progressData) progressData.jobId = jobId;
                writeSseEvent(res, progressData, controller);
            },
            {
                startPage,
                endPage,
                loadImages,
                signal: controller.signal,
                publicBasePath: `/temp/jobs/${jobId}`,
            }
        );

        // 5. काम पूरा होने पर 'done' भेजें
        flushStoryJson(writeStoryJson);
        const finalStoryData = safeFinalizeStoryDataFile(jsonFilePath, url, author, startedAt);
        logMemory("story stream completed");

        if (writeSseEvent(res, { done: true, jobId, meta: createStorySummary(finalStoryData) }, controller)) {
            res.end();
        }
    } catch (err) {
        flushStoryJson(writeStoryJson);
        safeFinalizeStoryDataFile(jsonFilePath, url, author, startedAt);
        console.error("=== CRITICAL SCRAPER ERROR ===");
        console.error(err);
        console.error("==============================");
        logMemory("story stream failed", "warn");

        if (writeSseEvent(res, { error: getClientErrorMessage(err), jobId }, controller)) {
            res.end();
        }
    }
};

exports.getSinglePage = async (req, res) => {
    try {
        const pageNum = Number(req.query.page) || 1;
        const jobId = getValidJobId(req.query.jobId);
        const jsonFilePath = path.join(getJobFolder(jobId), "story_data.json");

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
        pageHtml = fixJobImagePaths(pageHtml, jobId);

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
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Error fetching page from server" });
    }
};

function logMemoryUsage(page) {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(
        `Page ${page} Written to JSON. Memory cleaned. Current RAM usage: ${Math.round(used * 100) / 100} MB`,
    );
}

function cleanTempFolder(tempPath) {
    const imagesPath = path.join(tempPath, "images");
    const jsonFilePath = path.join(tempPath, "story_data.json");

    try {
        fs.mkdirSync(tempPath, { recursive: true });

        if (fs.existsSync(jsonFilePath)) {
            fs.rmSync(jsonFilePath, { force: true });
        }

        if (fs.existsSync(imagesPath)) {
            for (const imageFile of fs.readdirSync(imagesPath)) {
                fs.rmSync(path.join(imagesPath, imageFile), { recursive: true, force: true });
            }
        }
    } catch (err) {
        console.log(
            "Warning: Could not delete old temp files, skipping clean up:",
            err.message,
        );
    }
}

function fixJobImagePaths(html, jobId) {
    if (typeof html !== "string") return "";
    const jobImagePath = `/temp/jobs/${jobId}/images/`;

    return html
        .replace(/src="\/temp\/images\//g, `src="${jobImagePath}`)
        .replace(/src="images\//g, `src="${jobImagePath}`)
        .replace(/src="\.\/images\//g, `src="${jobImagePath}`);
}

function createJobId() {
    return crypto.randomUUID();
}

function getValidJobId(value) {
    const jobId = String(value || "").trim();
    if (!/^[a-f0-9-]{36}$/i.test(jobId)) {
        const err = new Error("Valid jobId missing");
        err.statusCode = 400;
        throw err;
    }
    return jobId;
}

function getJobFolder(jobId) {
    return path.join(__dirname, "..", "temp", "jobs", jobId);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function copyFilesInBatches(items, batchSize, worker) {
    for (let index = 0; index < items.length; index += batchSize) {
        const batch = items.slice(index, index + batchSize);
        await Promise.all(batch.map(worker));
    }
}

function createStoryDataShell(url, author, startedAt) {
    return {
        url: url || "",
        storyName: "Loading...",
        "writer-name": author || "",
        totalPage: 0,
        lastFetch: new Date().toISOString(),
        "total-image": 0,
        "image-downlaods": 0,
        "start-time": startedAt.toISOString(),
        "end time": "",
        "duration taken": "",
        "last-page-no": 0,
        posts: {
            eng: {},
            hindi: {},
        },
    };
}

function normalizeStoryData(storyData) {
    const posts = storyData.posts || {};
    const directEngPosts = Object.fromEntries(
        Object.entries(posts).filter(([key, value]) => {
            return /^\d+$/.test(key) && typeof value === "string";
        })
    );
    const normalized = {
        ...storyData,
        posts: {
            eng: posts.eng || directEngPosts,
            hindi: posts.hindi || {},
        },
    };

    const now = new Date();
    const postKeys = Object.keys(normalized.posts.eng);
    const numericPostKeys = postKeys
        .map((key) => Number.parseInt(key, 10))
        .filter((key) => Number.isInteger(key) && key > 0);
    const lastPostNo = numericPostKeys.length ? Math.max(...numericPostKeys) : 0;
    const detectedImages = countImagesInPosts(normalized.posts.eng);

    normalized.url = normalized.url || "";
    normalized.storyName = normalized.storyName || normalized.title || "Uploaded Story";
    normalized["writer-name"] = normalized["writer-name"] || normalized.writerName || normalized.author || "";
    normalized.totalPage = Number(normalized.totalPage || normalized.totalPages || lastPostNo || 0);
    normalized.lastFetch = normalized.lastFetch || now.toISOString();
    normalized["total-image"] = Number(normalized["total-image"] || normalized.totalImages || detectedImages || 0);
    normalized["image-downlaods"] = Number(normalized["image-downlaods"] || normalized.downloadedImages || 0);
    normalized["start-time"] = normalized["start-time"] || "";
    normalized["end time"] = normalized["end time"] || "";
    normalized["duration taken"] = normalized["duration taken"] || "";
    normalized["last-page-no"] = Number(normalized["last-page-no"] || normalized.lastPageNo || lastPostNo || 0);

    return normalized;
}

function readExistingStoryData(jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) return null;

    try {
        return normalizeStoryData(JSON.parse(fs.readFileSync(jsonFilePath, "utf8")));
    } catch (err) {
        console.error("Existing JSON read failed:", err.message);
        return null;
    }
}

function isSameStorySource(existingUrl, requestedUrl) {
    return getStorySourceKey(existingUrl) === getStorySourceKey(requestedUrl);
}

function getStorySourceKey(inputUrl) {
    if (!inputUrl) return "";

    try {
        const parsed = new URL(inputUrl);
        const domain = parsed.hostname.replace(/^www\./, "").toLowerCase();

        if (domain === "rajsharmastories.com") {
            return `${domain}:topic:${parsed.searchParams.get("t") || parsed.pathname}`;
        }

        if (domain === "xossipy.com") {
            return `${domain}:${parsed.pathname.replace(/-page-\d+\.html$/i, ".html")}`;
        }

        return `${domain}:${parsed.pathname.replace(/\/page-\d+\/?$/i, "").replace(/\/?$/, "/")}`;
    } catch (err) {
        return String(inputUrl).trim();
    }
}

function getNextPostNumber(posts) {
    const keys = Object.keys(posts)
        .map((key) => Number.parseInt(key, 10))
        .filter((key) => Number.isInteger(key) && key > 0);

    return keys.length ? Math.max(...keys) + 1 : 1;
}

function findPostNumberByHtml(posts, html) {
    const target = normalizeHtmlForDuplicate(html);
    if (!target) return null;

    return Object.keys(posts).find((key) => {
        return normalizeHtmlForDuplicate(posts[key]) === target;
    }) || null;
}

function normalizeHtmlForDuplicate(html) {
    if (typeof html !== "string") return "";

    return html
        .replace(/src="(?:\/temp\/)?images\//g, 'src="images/')
        .replace(/src="\.\/images\//g, 'src="images/')
        .replace(/\s+src="[^"]*"/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function createJsonWriteBuffer(jsonFilePath) {
    const minWriteIntervalMs = 10000;
    let pendingJson = null;
    let lastWriteAt = 0;

    const writeNow = () => {
        if (!pendingJson) return;

        writeStoryDataFile(jsonFilePath, pendingJson);
        pendingJson = null;
        lastWriteAt = Date.now();
    };

    const bufferedWrite = (storyData) => {
        pendingJson = storyData;

        if (Date.now() - lastWriteAt >= minWriteIntervalMs) {
            writeNow();
        }
    };

    bufferedWrite.flush = writeNow;

    return bufferedWrite;
}

function flushStoryJson(writeStoryJson) {
    if (!writeStoryJson) return;

    try {
        writeStoryJson.flush();
    } catch (err) {
        console.error("Final JSON flush failed:", err.message);
    }
}

function safeFinalizeStoryDataFile(jsonFilePath, url, author, startedAt) {
    try {
        return finalizeStoryDataFile(jsonFilePath, url, author, startedAt);
    } catch (err) {
        console.error("Final story_data.json update failed:", err.message);
        return null;
    }
}

function writeSseEvent(res, payload, controller) {
    if (res.writableEnded || res.destroyed) return false;

    try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        return true;
    } catch (err) {
        console.error("SSE write failed:", err.message);
        if (controller) controller.abort();
        return false;
    }
}

function countImagesInPosts(posts) {
    return Object.values(posts).reduce((count, html) => {
        return count + countImagesInHtml(html);
    }, 0);
}

function countImagesInHtml(html) {
    if (typeof html !== "string") return 0;
    const matches = html.match(/<img\b/gi);
    return matches ? matches.length : 0;
}

function ensureStoryDataMeta(storyData, url, author, startedAt) {
    storyData.url = storyData.url || url || "";
    storyData["writer-name"] = storyData["writer-name"] || author || "";
    storyData.totalPage = storyData.totalPage || 0;
    storyData.lastFetch = storyData.lastFetch || new Date().toISOString();
    storyData["total-image"] = storyData["total-image"] || 0;
    storyData["image-downlaods"] = storyData["image-downlaods"] || 0;
    storyData["start-time"] = storyData["start-time"] || startedAt.toISOString();
    storyData["end time"] = storyData["end time"] || "";
    storyData["duration taken"] = storyData["duration taken"] || "";
    storyData["last-page-no"] = storyData["last-page-no"] || 0;
}

function finalizeStoryDataFile(jsonFilePath, url, author, startedAt) {
    if (!fs.existsSync(jsonFilePath)) return null;

    const completedAt = new Date();
    const storyData = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

    ensureStoryDataMeta(storyData, url, author, startedAt);
    if (!storyData.posts) storyData.posts = { eng: {}, hindi: {} };
    if (!storyData.posts.eng) storyData.posts.eng = {};
    storyData.posts.hindi = storyData.posts.hindi || {};

    storyData.lastFetch = completedAt.toISOString();
    storyData["end time"] = completedAt.toISOString();
    storyData["duration taken"] = formatDuration(completedAt - startedAt);

    writeStoryDataFile(jsonFilePath, storyData);
    return storyData;
}

function writeStoryDataFile(jsonFilePath, storyData) {
    fs.writeFileSync(jsonFilePath, JSON.stringify(storyData));
}

function createStorySummary(storyData) {
    if (!storyData || typeof storyData !== "object") return null;

    return {
        url: storyData.url || "",
        storyName: storyData.storyName || storyData.title || "",
        "writer-name": storyData["writer-name"] || storyData.writerName || storyData.author || "",
        totalPage: Number(storyData.totalPage || storyData.totalPages || 0),
        lastFetch: storyData.lastFetch || "",
        "total-image": Number(storyData["total-image"] || storyData.totalImages || 0),
        "image-downlaods": Number(storyData["image-downlaods"] || storyData.downloadedImages || 0),
        "start-time": storyData["start-time"] || "",
        "end time": storyData["end time"] || "",
        "duration taken": storyData["duration taken"] || "",
        "last-page-no": Number(storyData["last-page-no"] || storyData.lastPageNo || 0),
    };
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
        hours ? `${hours}h` : "",
        minutes ? `${minutes}m` : "",
        `${seconds}s`,
    ].filter(Boolean).join(" ");
}

function parsePositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function getClientErrorMessage(err) {
    const messages = {
        AUTHOR_MISSING: "Author name missing",
        AUTHOR_NOT_FOUND: "Author not found in selected pages",
        DOMAIN_NOT_SUPPORTED: "Domain not supported yet. Saved in backend domain hit list.",
        FETCH_CANCELLED: "Fetch cancelled",
        NO_STORY_POSTS: "No story posts found for this author",
        SITE_UNREACHABLE: "Site unreachable or page could not be loaded",
        URL_INVALID: "Invalid URL",
        URL_MISSING: "URL missing",
    };

    return messages[err.code] || err.message || "Scraping failed";
}
