const express = require("express");

const router = express.Router();

const { translateJson } = require("../controllers/translateController");

router.post("/translate-json", translateJson);

router.get("/translate-json", (req, res) => {
	res.send("Use POST request");
});

module.exports = router;
