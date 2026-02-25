const path = require("path");

function sanitizeFolderName(name) {
    return name
        .replace(/[<>:"/\\|?*]+/g, "")  // invalid chars remove
        .replace(/\s+/g, " ")
        .trim();
}

module.exports = { sanitizeFolderName };