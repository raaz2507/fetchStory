const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const storyRoutes = require("./routes/storyRoutes");
const readerRoutes = require("./routes/readerRoutes");
const translatorRoutes = require("./translator/routes/translateRoute");
const translatorProgressRoutes = require("./translator/routes/progressRoute");

process.on("uncaughtException", (err) => {
    logProcessCrash("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
    logProcessCrash("unhandledRejection", reason);
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.static("public"));

app.use("/api/story", storyRoutes);
app.use(readerRoutes);
app.use("/api/translator", translatorRoutes);
app.use("/api/translator", translatorProgressRoutes);

app.use("/temp", express.static(path.join(__dirname, "temp")));
app.use('/temp/images', express.static(path.join(__dirname, 'temp', 'images')));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));
app.use("/translator/outputs", express.static(path.join(__dirname, "translator", "outputs")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

function logProcessCrash(type, reason) {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const message = [
        "",
        `[${new Date().toISOString()}] ${type}`,
        err.stack || err.message,
        "",
    ].join("\n");

    console.error(message);

    try {
        const tempFolder = path.join(__dirname, "temp");
        fs.mkdirSync(tempFolder, { recursive: true });
        fs.appendFileSync(path.join(tempFolder, "server-crash.log"), message);
    } catch (logErr) {
        console.error("Could not write crash log:", logErr.message);
    }
}
