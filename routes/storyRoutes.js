const express = require("express");
const router = express.Router();

const {
    streamStory,
    downloadStory,
    storyMeta,
    getSinglePage,
    uploadStoryJson,
    processUploadedStoryImages,
    streamUploadedStoryImages,
} = require("../controllers/storyController");

router.get("/stream", streamStory); // फ्रंटएंड: /api/story/stream
router.get("/meta", storyMeta);     // फ्रंटएंड: /api/story/meta
router.post("/download", downloadStory);
router.post("/upload-json", uploadStoryJson);
router.post("/process-uploaded-images", processUploadedStoryImages);
router.get("/process-uploaded-images-stream", streamUploadedStoryImages);

// 3. स्क्रोल करने पर सिंगल पेज देने वाला नया रूट यहाँ जोड़ें
router.get("/get-page", getSinglePage); // फ्रंटएंड: /api/story/get-page

module.exports = router;
