const express = require("express");
const cors = require("cors");
const path = require("path");

const storyRoutes = require("./routes/storyRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use("/api/story", storyRoutes);

app.use("/temp", express.static(path.join(__dirname, "temp")));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});