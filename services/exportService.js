const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

async function createZip(folderPath, zipPath) {
    return new Promise((resolve, reject) => {

        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", resolve);
        archive.on("error", reject);

        archive.pipe(output);
        archive.directory(folderPath, false);
        archive.finalize();
    });
}

module.exports = { createZip };