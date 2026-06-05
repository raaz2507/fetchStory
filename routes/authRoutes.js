const express = require("express");

const {
    publicRegister,
    publicLogin,
    publicLogout,
    getPublicSession,
} = require("../controllers/adminController");

const router = express.Router();

router.post("/register", publicRegister);
router.post("/login", publicLogin);
router.post("/logout", publicLogout);
router.get("/session", getPublicSession);

module.exports = router;
