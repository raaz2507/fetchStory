const express = require("express");

const router = express.Router();

const {
	translateJson,
	cancelTranslation,
} = require("../controllers/translateController");

router.post("/translate-json", translateJson);
router.post("/translate-json/:jobId/cancel", cancelTranslation);

router.get("/translate-json", (req, res) => {
	res.send("Use POST request");
});

module.exports = router;
