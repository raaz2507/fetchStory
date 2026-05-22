const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const savedHashes = new Map();

async function downloadImageWithHash(imgUrl, baseFolder, imageIndex, totalImages, baseURL, signal, progressCallback) {
    let finalUrl;
    try {
        finalUrl = new URL(imgUrl, baseURL).href;
    } catch (err) {
        return null;
    }

    console.log(`\nImage [${imageIndex}/${totalImages}] starting: ${finalUrl}`);

    const imagesFolder = path.join(baseFolder, "images");
    if (!fs.existsSync(imagesFolder)) {
        fs.mkdirSync(imagesFolder, { recursive: true });
    }

    const response = await axios({
        url: finalUrl,
        responseType: "stream",
        signal,
        timeout: 30000
    });

    const totalLength = Number(response.headers["content-length"] || 0);
    const tempFilePath = path.join(imagesFolder, `download-${Date.now()}-${imageIndex}.tmp`);
    const writer = fs.createWriteStream(tempFilePath);
    const hash = crypto.createHash("sha256");
    let downloadedLength = 0;
    let lastProgressPercent = -1;

    if (totalLength) {
        console.log(`Image size: ${Math.round(totalLength / 1024)} KB`);
    }

    response.data.on("data", (chunk) => {
        downloadedLength += chunk.length;
        hash.update(chunk);

        const imagePercent = totalLength ? Math.floor((downloadedLength / totalLength) * 100) : 0;
        if (totalLength) {
            process.stdout.write(`Image ${imageIndex}: ${imagePercent}%\r`);
        }

        if (progressCallback && shouldReportProgress(imagePercent, lastProgressPercent, downloadedLength, totalLength)) {
            lastProgressPercent = imagePercent;
            progressCallback({
                imageIndex,
                totalImages,
                imagePercent,
                downloadedBytes: downloadedLength,
                totalBytes: totalLength,
                imageUrl: finalUrl
            });
        }
    });

    await new Promise((resolve, reject) => {
        let abort;
        const cleanup = () => {
            if (signal && abort) signal.removeEventListener("abort", abort);
        };
        abort = () => {
            response.data.destroy();
            writer.destroy();
            cleanup();
            reject(createScrapeError("FETCH_CANCELLED", "Fetch cancelled"));
        };

        writer.on("finish", () => {
            cleanup();
            resolve();
        });
        writer.on("error", (err) => {
            cleanup();
            reject(err);
        });
        response.data.on("error", (err) => {
            cleanup();
            reject(err);
        });

        if (signal) {
            if (signal.aborted) {
                abort();
                return;
            }
            signal.addEventListener("abort", abort, { once: true });
        }

        response.data.pipe(writer);
    });

    const digest = hash.digest("hex").slice(0, 10);

    if (savedHashes.has(digest)) {
        fs.rmSync(tempFilePath, { force: true });
        console.log("\nDuplicate image skipped");
        return savedHashes.get(digest);
    }

    const ext = path.extname(new URL(finalUrl).pathname) || ".jpg";
    const fileName = `${digest}${ext}`;
    const filePath = path.join(imagesFolder, fileName);

    fs.renameSync(tempFilePath, filePath);

    const relativePath = `images/${fileName}`;
    savedHashes.set(digest, relativePath);

    console.log(`\nSaved image as ${fileName}`);

    return relativePath;
}

function shouldReportProgress(currentPercent, lastPercent, downloadedLength, totalLength) {
    if (!totalLength) return downloadedLength === 0;
    return currentPercent === 100 || currentPercent >= lastPercent + 5;
}

function createScrapeError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

module.exports = { downloadImageWithHash };
