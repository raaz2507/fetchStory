const translatorRoutes = require("../../routes/translateRoutes");
const translatorProgressRoutes = require("./progressRoute");

function mountTranslator(app, options) {
	app.use("/api/translator", options.requirePublicAuth, translatorRoutes);
	app.use("/api/translator", options.requirePublicAuth, translatorProgressRoutes);
}

module.exports = { mountTranslator };
