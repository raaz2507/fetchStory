const express = require("express");
const cors = require("cors");
const path = require("path");
const { patchConsole, logCrash, logMemory } = require("./utils/logger");

const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const { requirePublicAuth, redirectToPublicLogin } = require("./controllers/adminController");
const { mountDashboard } = require("./src/dashboard");
const { mountReader } = require("./src/reader");
const { mountTranslator } = require("./src/translator");

patchConsole();

process.on("uncaughtException", (err) => {
	logCrash("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
	logCrash("unhandledRejection", reason);
});

function createApp() {
	const app = express();

	app.use(
		cors({
			origin: true,
			credentials: true,
		}),
	);
	app.use(express.json({ limit: "50mb" }));

	app.locals.baseUrl = "http://localhost:3000";
// app.use((req, res, next) => {
//     const host = req.headers.host || "";
//     if (host.startsWith("127.0.0.1:")) {
//         return res.redirect(301, `${req.protocol}://localhost:${host.split(":")[1]}${req.originalUrl}`);
//     }
//     next();
// });

	app.use((req, res, next) => {
		const startedAt = Date.now();

		if (process.env.NODE_ENV !== "production") {
			console.log("Cookie:", req.headers.cookie ? "[present]" : "[none]");
		}

		res.on("finish", () => {
			const durationMs = Date.now() - startedAt;
			console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
			if (durationMs > 30000) {
				logMemory(`${req.method} ${req.originalUrl} finished after ${durationMs}ms`);
			}
		});
		next();
	});

	app.use("/api/auth", authRoutes);
	app.use("/images", express.static(path.join(__dirname, "temp", "images")));

	app.get("/admin.html", (req, res) => res.redirect("/admin"));
	app.get("/admin/login", (req, res) => res.redirect("/admin"));
	app.get("/admin", (req, res) => {
		res.sendFile(path.join(__dirname, "public", "admin.html"));
	});

	mountDashboard(app, {
		rootFolder: __dirname,
		requirePublicAuth,
		redirectToPublicLogin,
	});
	mountReader(app, {
		rootFolder: __dirname,
		requirePublicAuth,
		redirectToPublicLogin,
	});

	app.use(express.static("public", { index: false }));
	app.use("/vendor/jszip", express.static(path.join(__dirname, "node_modules", "jszip", "dist")));

	app.use("/api/admin", adminRoutes);
	mountTranslator(app, { requirePublicAuth });

	app.use("/temp", express.static(path.join(__dirname, "temp")));
	app.use("/temp/images", express.static(path.join(__dirname, "temp", "images")));
	app.use("/downloads", express.static(path.join(__dirname, "downloads")));
	app.use("/translator/outputs", express.static(path.join(__dirname, "translator", "outputs")));

	return app;
}

if (require.main === module) {
	const PORT = process.env.PORT || 3000;
	createApp().listen(PORT, () => {
		console.log(`Server running on http://localhost:${PORT}`);
		logMemory("server started");
	});
}

module.exports = { createApp };
