const fs = require("fs");
const path = require("path");

const logsFolder = path.join(__dirname, "..", "logs");
const serverLogPath = path.join(logsFolder, "site-log.log");
const crashLogPath = path.join(logsFolder, "server-crash.log");
const settingsFolder = path.join(__dirname, "..", "data");
const settingsPath = path.join(settingsFolder, "admin-settings.json");
const maxLogBytes = 20 * 1024 * 1024;
const originalConsole = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
};

let isConsolePatched = false;
let fileLoggingEnabledCache = null;

function ensureLogsFolder() {
	fs.mkdirSync(logsFolder, { recursive: true });
}

function ensureSettingsFolder() {
	fs.mkdirSync(settingsFolder, { recursive: true });
}

function readSettings() {
	try {
		if (!fs.existsSync(settingsPath)) {
			return { fileLoggingEnabled: true };
		}

		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
		return {
			fileLoggingEnabled: settings.fileLoggingEnabled !== false,
		};
	} catch (err) {
		originalConsole.error("Could not read admin settings:", err.message);
		return { fileLoggingEnabled: true };
	}
}

function writeSettings(settings) {
	ensureSettingsFolder();
	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function isFileLoggingEnabled() {
	if (fileLoggingEnabledCache === null) {
		fileLoggingEnabledCache = readSettings().fileLoggingEnabled;
	}

	return fileLoggingEnabledCache;
}

function setFileLoggingEnabled(enabled) {
	fileLoggingEnabledCache = Boolean(enabled);
	writeSettings({ fileLoggingEnabled: fileLoggingEnabledCache });
	return fileLoggingEnabledCache;
}

function formatValue(value) {
	if (value instanceof Error) {
		return value.stack || value.message;
	}

	if (typeof value === "string") return value;

	try {
		return JSON.stringify(value);
	} catch (err) {
		return String(value);
	}
}

function writeLine(level, values, filePath = serverLogPath) {
	try {
		if (filePath === serverLogPath && !isFileLoggingEnabled()) return;

		ensureLogsFolder();
		rotateLogIfNeeded(filePath);
		const message = values.map(formatValue).join(" ");
		fs.appendFileSync(filePath, `[${new Date().toISOString()}] [${level}] ${message}\n`);
	} catch (err) {
		originalConsole.error("Could not write log file:", err.message);
	}
}

function rotateLogIfNeeded(filePath) {
	if (!fs.existsSync(filePath)) return;

	const stat = fs.statSync(filePath);
	if (stat.size < maxLogBytes) return;

	const rotatedPath = `${filePath}.old`;
	if (fs.existsSync(rotatedPath)) {
		fs.rmSync(rotatedPath, { force: true });
	}
	fs.renameSync(filePath, rotatedPath);
}

function patchConsole() {
	if (isConsolePatched) return;
	isConsolePatched = true;

	["log", "info", "warn", "error"].forEach((level) => {
		console[level] = (...values) => {
			originalConsole[level](...values);
			writeLine(level.toUpperCase(), values);
		};
	});
}

function logCrash(type, reason) {
	const err = reason instanceof Error ? reason : new Error(String(reason));
	writeLine("CRASH", [type, err], crashLogPath);
	writeLine("CRASH", [type, err], serverLogPath);
}

function logMemory(label, level = "info") {
	const usage = process.memoryUsage();
	const heapMb = Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
	const rssMb = Math.round((usage.rss / 1024 / 1024) * 100) / 100;
	console[level](`[memory] ${label}: heap=${heapMb}MB rss=${rssMb}MB`);
}

module.exports = {
	patchConsole,
	logCrash,
	logMemory,
	isFileLoggingEnabled,
	setFileLoggingEnabled,
	serverLogPath,
	crashLogPath,
};
