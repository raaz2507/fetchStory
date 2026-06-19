const path = require("path");

const {
	router: readerRoutes,
	serveLocalImage,
} = require("../../routes/readerRoutes");

function mountReader(app, options) {
	const { requirePublicAuth, redirectToPublicLogin } = options;

	app.get("/reader_template.html", (req, res) => {
		res.redirect("/reader-translator");
	});
	app.get("/reader-translator", redirectToPublicLogin, (req, res) => {
		res.sendFile(path.join(options.rootFolder, "public", "reader_template.html"));
	});
	app.use("/api/reader", requirePublicAuth, readerRoutes);
	app.use("/local-images", requirePublicAuth, serveLocalImage);
}

module.exports = { mountReader };
