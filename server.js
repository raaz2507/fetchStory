const express = require("express");
const cors = require("cors");
const path = require("path");

const storyRoutes = require("./routes/storyRoutes");
const readerRoutes = require("./routes/readerRoutes");
const translatorRoutes = require("./translator/routes/translateRoute");
const translatorProgressRoutes = require("./translator/routes/progressRoute");

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
