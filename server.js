const express = require("express");
const cors = require("cors");
const path = require("path");
const { patchConsole, logCrash, logMemory } = require("./utils/logger");

const storyRoutes = require("./routes/storyRoutes");
const readerRoutes = require("./routes/readerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const translatorRoutes = require("./translator/routes/translateRoute");
const translatorProgressRoutes = require("./translator/routes/progressRoute");
const { requirePublicAuth, redirectToPublicLogin } = require("./controllers/adminController");

patchConsole();

process.on("uncaughtException", (err) => {
    logCrash("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
    logCrash("unhandledRejection", reason);
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/api/auth", authRoutes);

app.get(["/", "/index.html", "/reader_template.html"], redirectToPublicLogin);
app.use(express.static("public"));

app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
        if (durationMs > 30000) {
            logMemory(`${req.method} ${req.originalUrl} finished after ${durationMs}ms`);
        }
    });
    next();
});

app.use("/api/admin", adminRoutes);
app.use("/api/story", requirePublicAuth, storyRoutes);
app.use(requirePublicAuth, readerRoutes);
app.use("/api/translator", requirePublicAuth, translatorRoutes);
app.use("/api/translator", requirePublicAuth, translatorProgressRoutes);

app.use("/temp", express.static(path.join(__dirname, "temp")));
app.use('/temp/images', express.static(path.join(__dirname, 'temp', 'images')));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));
app.use("/translator/outputs", express.static(path.join(__dirname, "translator", "outputs")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    logMemory("server started");
});
