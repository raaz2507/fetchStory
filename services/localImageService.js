const fs = require("fs");
const path = require("path");

let localImageFolder = "";

function setLocalImageFolder(folderPath) {
    const cleanPath = folderPath
        ? String(folderPath).trim().replace(/^["']|["']$/g, "")
        : "";

    if (!cleanPath) {
        localImageFolder = "";
        return "";
    }

    const resolvedPath = path.resolve(cleanPath);

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
        const error = new Error(`Image folder not found: ${resolvedPath}`);
        error.statusCode = 400;
        throw error;
    }

    localImageFolder = resolvedPath;
    console.log(`[reader] Image folder set: ${localImageFolder}`);
    return localImageFolder;
}

function getLocalImagePath(requestPath) {
    if (!localImageFolder) {
        const error = new Error("Image folder path not set");
        error.statusCode = 404;
        throw error;
    }

    const requestedFile = path.basename(decodeURIComponent(requestPath));
    const candidates = [
        path.join(localImageFolder, requestedFile),
        path.join(localImageFolder, "images", requestedFile),
    ];
    const imagePath = candidates.find((candidate) => {
        return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    });

    if (!imagePath) {
        console.log(
            `[reader] Image not found: ${requestedFile}. Tried: ${candidates.join(" | ")}`
        );
        const error = new Error(`Image not found: ${requestedFile}`);
        error.statusCode = 404;
        throw error;
    }

    return imagePath;
}

module.exports = {
    setLocalImageFolder,
    getLocalImagePath,
};
