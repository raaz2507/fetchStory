const express = require("express");
const router = express.Router();

const { streamStory, downloadStory } = require("../controllers/storyController");

router.get("/", streamStory);       // SSE route
router.post("/download", downloadStory);

module.exports = router;