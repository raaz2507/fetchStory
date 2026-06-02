const express = require("express");

const {
    setImageFolder,
    serveLocalImage,
} = require("../controllers/readerController");

const router = express.Router();

router.post("/api/reader/image-folder", setImageFolder);
router.use("/local-images", serveLocalImage);

module.exports = router;
