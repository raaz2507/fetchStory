const express = require("express");

const { setImageFolder, serveLocalImage } = require("../controllers/readerController");

const router = express.Router();

router.post("/image-folder", setImageFolder);

module.exports = { router, serveLocalImage,};
