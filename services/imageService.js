const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const savedHashes = new Map();

async function downloadImageWithHash(imgUrl, baseFolder, imageIndex, totalImages, baseURL) {
    let finalUrl;
    try {
        finalUrl = new URL(imgUrl, baseURL).href;
    } catch (err) {
        console.log(`Invalid image URL: ${imgUrl}`);
        return null;
    }

    console.log(`\nImage [${imageIndex}/${totalImages}] starting: ${finalUrl}`);

    const imagesFolder = path.join(baseFolder, "images");
    if (!fs.existsSync(imagesFolder)) {
        fs.mkdirSync(imagesFolder, { recursive: true });
    }

    const response = await axios({
        url: finalUrl,
        responseType: "stream"
    });

    const totalLength = Number(response.headers["content-length"] || 0);
    let downloadedLength = 0;
    const chunks = [];

    if (totalLength) {
        console.log(`Image size: ${Math.round(totalLength / 1024)} KB`);
    }

    response.data.on("data", (chunk) => {
        downloadedLength += chunk.length;
        chunks.push(chunk);

        if (totalLength) {
            const percent = ((downloadedLength / totalLength) * 100).toFixed(1);
            process.stdout.write(`Image ${imageIndex}: ${percent}%\r`);
        }
    });

    await new Promise((resolve, reject) => {
        response.data.on("end", resolve);
        response.data.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 10);

    if (savedHashes.has(hash)) {
        console.log("\nDuplicate image skipped");
        return savedHashes.get(hash);
    }

    const ext = path.extname(new URL(finalUrl).pathname) || ".jpg";
    const fileName = `${hash}${ext}`;
    const filePath = path.join(imagesFolder, fileName);

    fs.writeFileSync(filePath, buffer);

    const relativePath = `images/${fileName}`;
    savedHashes.set(hash, relativePath);

    console.log(`\nSaved image as ${fileName}`);

    return relativePath;
}

module.exports = { downloadImageWithHash };
