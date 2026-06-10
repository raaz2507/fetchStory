const path = require("path");

function sanitizeFolderName(name, type = "default") {
	const limits = {
		json: 100,
		zip: 100,
		images: 80,
		default: 100,
	};

	let maxLength = limits[type] || limits.default;

	let safeName = String(name)
		.trim()
		.replace(/[<>:"/\\|?*]+/g, "") // Windows invalid chars remove
		.replace(/\s+/g, "_")          // spaces → underscore
		.replace(/_+/g, "_")           // multiple underscores fix
		.replace(/[. ]+$/g, "");       // remove ending dots/spaces

	// Length limit
	if (safeName.length > maxLength) {
		safeName = safeName
			.substring(0, maxLength)
			.replace(/[._-]+$/g, "");
	}

	// Windows reserved filenames
	const reservedNames = [
		"CON", "PRN", "AUX", "NUL",
		"COM1", "COM2", "COM3", "COM4", "COM5",
		"COM6", "COM7", "COM8", "COM9",
		"LPT1", "LPT2", "LPT3", "LPT4", "LPT5",
		"LPT6", "LPT7", "LPT8", "LPT9"
	];

	if (reservedNames.includes(safeName.toUpperCase())) {
		safeName = `story_${safeName}`;
	}

	return safeName || "story";
}

module.exports = { sanitizeFolderName };