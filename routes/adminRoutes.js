const express = require("express");

const {
    requireAdminAuth,
    login,
    logout,
    getSession,
    getAdminStatus,
    updateLogging,
    clearOutputs,
    createUser,
    updateUser,
    reviewModerationItem,
    exportStore,
    restoreStore,
} = require("../controllers/adminController");

const router = express.Router();

router.post("/login", login);

router.use(requireAdminAuth);

router.get("/session", getSession);
router.post("/logout", logout);
router.get("/status", getAdminStatus);
router.post("/logging", updateLogging);
router.delete("/outputs", clearOutputs);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.post("/moderation/:id/review", reviewModerationItem);
router.get("/store/export", exportStore);
router.post("/store/restore", restoreStore);

module.exports = router;
