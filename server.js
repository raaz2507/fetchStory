const express = require("express");
const cors = require("cors");
const path = require("path");
const { patchConsole, logCrash, logMemory } = require("./utils/logger");

const storyRoutes = require("./routes/storyRoutes");
const { router: readerRoutes, serveLocalImage } = require("./routes/readerRoutes");
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

app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json({ limit: "50mb" }));


app.locals.baseUrl = "http://localhost:3000";
// app.use((req, res, next) => {
//     const host = req.headers.host || "";
//     if (host.startsWith("127.0.0.1:")) {
//         return res.redirect(301, `${req.protocol}://localhost:${host.split(":")[1]}${req.originalUrl}`);
//     }
//     next();
// });

app.use("/api/auth", authRoutes);
app.use("/images", express.static(path.join(__dirname, "temp", "images")));

app.get("/", (req, res) => {
    res.redirect("/home");
});
app.get("/index.html", (req, res) => {
    res.redirect("/home");
});
app.get("/reader_template.html", (req, res) => {
    res.redirect("/reader-translator");
});
app.get("/home", redirectToPublicLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/reader-translator", redirectToPublicLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "reader_template.html"));
});
app.use(express.static("public"));

app.use((req, res, next) => {
    const startedAt = Date.now();

    console.log("Cookie:", req.headers.cookie);
    console.log("Session:", req.session);
    
    res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
        if (durationMs > 30000) {
            logMemory(`${req.method} ${req.originalUrl} finished after ${durationMs}ms`);
        }
    });
    next();
});

// ==========================


// console.log("adminRoutes:", typeof adminRoutes);
// console.log("storyRoutes:", typeof storyRoutes);
// console.log("readerRoutes:", typeof readerRoutes);
// console.log("serveLocalImage:", typeof serveLocalImage);
// console.log("translatorRoutes:", typeof translatorRoutes);
// console.log("translatorProgressRoutes:", typeof translatorProgressRoutes);
// console.log("requirePublicAuth:", typeof requirePublicAuth);






//==============================

app.use("/api/admin", adminRoutes);
app.use("/api/story", requirePublicAuth, storyRoutes);
app.use("/api/reader", requirePublicAuth, readerRoutes);
app.use("/local-images", requirePublicAuth, serveLocalImage);
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
