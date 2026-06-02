const {
    setLocalImageFolder,
    getLocalImagePath,
} = require("../services/localImageService");

function setImageFolder(req, res) {
    try {
        const path = setLocalImageFolder(req.body && req.body.path);
        res.json({ success: true, path });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message,
        });
    }
}

function serveLocalImage(req, res) {
    try {
        const imagePath = getLocalImagePath(req.path);
        res.sendFile(imagePath);
    } catch (err) {
        res.status(err.statusCode || 500).send(err.message);
    }
}

module.exports = {
    setImageFolder,
    serveLocalImage,
};
