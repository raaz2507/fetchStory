const path = require("path");

const storyRoutes = require("../../routes/storyRoutes");

function mountDashboard(app, options) {
	const { requirePublicAuth, redirectToPublicLogin } = options;

	app.get("/", (req, res) => {
		res.redirect("/home");
	});
	app.get("/index.html", (req, res) => {
		res.redirect("/home");
	});
	app.get("/home", redirectToPublicLogin, (req, res) => {
		res.sendFile(path.join(options.rootFolder, "public", "index.html"));
	});
	app.use("/api/story", requirePublicAuth, storyRoutes);
}

module.exports = { mountDashboard };
