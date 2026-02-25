const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const savedHashes = new Map();

async function downloadImageWithHash(imgUrl, baseFolder, imageIndex, totalImages) {
    console.log(`\n📸 [${imageIndex}/${totalImages}] Starting: ${imgUrl}`);

    const imagesFolder = path.join(baseFolder, "images");
    if (!fs.existsSync(imagesFolder)) {
        fs.mkdirSync(imagesFolder, { recursive: true });
    }

    const response = await axios({
        url: imgUrl,
        responseType: "stream"
    });

    const totalLength = response.headers["content-length"];
    let downloadedLength = 0;
    const chunks = [];

    if (totalLength) {
        console.log(`📦 Size: ${Math.round(totalLength / 1024)} KB`);
    }

    response.data.on("data", (chunk) => {
        downloadedLength += chunk.length;
        chunks.push(chunk);

        if (totalLength) {
            const percent = ((downloadedLength / totalLength) * 100).toFixed(1);
            process.stdout.write(
                `⏳ Image ${imageIndex}: ${percent}%\r`
            );
        }
    });

    await new Promise((resolve, reject) => {
        response.data.on("end", resolve);
        response.data.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);

    const hash = crypto.createHash("sha256")
        .update(buffer)
        .digest("hex")
        .slice(0, 10);

    if (savedHashes.has(hash)) {
        console.log(`\n♻ Duplicate skipped`);
        return savedHashes.get(hash);
    }

    const ext = path.extname(imgUrl.split("?")[0]) || ".jpg";
    const fileName = `${hash}${ext}`;
    const filePath = path.join(imagesFolder, fileName);

    fs.writeFileSync(filePath, buffer);

    const relativePath = `images/${fileName}`;
    savedHashes.set(hash, relativePath);

    console.log(`\n💾 Saved as ${fileName}`);

    return relativePath;
}
async function downloadImagesBatch(imageUrls, baseFolder) {
    console.log(`\n🚀 Starting batch download`);
    console.log(`🖼 Total images: ${imageUrls.length}`);

    const totalImages = imageUrls.length;
    let completed = 0;

    for (let i = 0; i < totalImages; i++) {
        try {
            await downloadImageWithHash(
                imageUrls[i],
                baseFolder,
                i + 1,
                totalImages
            );

            completed++;

            const overallPercent = ((completed / totalImages) * 100).toFixed(1);
            console.log(`📊 Overall Progress: ${overallPercent}%`);
        } catch (err) {
            console.error(`❌ Failed: ${imageUrls[i]}`);
        }
    }

    console.log(`\n🎉 Batch Download Complete!`);
}

module.exports = { downloadImageWithHash };