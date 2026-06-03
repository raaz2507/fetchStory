const fs = require("fs");
const path = require("path");

const domainConfigs = {
	"exforum.live": {
		titleSelector: ".p-title-value",
		lastPageSelector: ".pageNav-main a",
		writerNameSelector: ".p-body-header .p-description ul li a.username",
		postBodySelector: (writerName) => `article[data-author="${cssAttributeEscape(writerName)}"] .message-inner .message-cell--main .message-main .message-content .message-userContent article.message-body.js-selectToQuote`,
		// fallbackPostSelector: "article.message-body.js-selectToQuote, article.message-body",
		// fallbackWriterSelector: ".message-userDetails span[itemprop='name']",
	},
	"xforum.live": null,
	"xossipy.com": {
		// Thread title
		titleSelector: "td.thead strong",
		titleSelectorPosition: "last",

		// Last page button
		lastPageSelector: ".pagination a[href^=\"thread-\"]",

		// Original writer name
		writerNameSelector: "#posts .post:first .author_information .largetext a",

		// Custom extraction logic
		customPostExtractor: ($, writerName) => {
			const posts = [];

			$("#posts > .post").each((index, el) => {
				const post = $(el);

				// Current post author
				const authorName = post.find(".author_information .largetext a").first().text().trim();

				// Skip if author not matched
				if (normalizeName(authorName) !== normalizeName(writerName)) {
					return;
				}

				// Post ID
				const postId = post.attr("id")?.replace("post_", "") || null;

				// Post body HTML
				const bodyHTML = post.find(".post_body").first().html()?.trim();

				if (!bodyHTML) return;

				posts.push({
					index: index + 1,
					postId,
					authorName,
					bodyHTML,
				});
			});

			return posts;
		},
	},
	"rajsharmastories.com": {
		titleSelector: "h2.topic-title a, h2.topic-title",
		lastPageSelector: ".pagination a",
		writerNameSelector: ".post:first .postprofile a.username, .post:first .username",
		customPostExtractor: ($, writerName) => {
			const posts = [];

			$(".post").each((index, el) => {
				const post = $(el);
				const authorName = post.find(".postprofile a.username, .username").first().text().trim();

				if (normalizeName(authorName) !== normalizeName(writerName)) {
					return;
				}

				const postId = post.attr("id") || null;
				const bodyHTML = post.find(".content").first().html()?.trim();

				if (!bodyHTML) return;

				posts.push({
					index: index + 1,
					postId,
					authorName,
					bodyHTML,
				});
			});

			return posts;
		},
	},
};

function normalizeName(name = "") {
	return name.toLowerCase().replace(/\s+/g, " ").trim();
}
domainConfigs["xforum.live"] = domainConfigs["exforum.live"];

function getDomainConfig(inputUrl) {
	const domain = getDomain(inputUrl);
	const config = domainConfigs[domain];

	return {
		domain,
		config: config && isUsableConfig(config) ? config : null,
		isKnown: Boolean(config),
	};
}

function getDomain(inputUrl) {
	const parsed = new URL(inputUrl);
	return parsed.hostname.replace(/^www\./, "").toLowerCase();
}

function recordUnsupportedDomain(inputUrl) {
	let domain = "invalid-url";
	try {
		domain = getDomain(inputUrl);
	} catch (err) {
		// Keep invalid-url as the bucket.
	}

	const dataFolder = path.join(__dirname, "..", "data");
	const filePath = path.join(dataFolder, "domain_hits.json");

	fs.mkdirSync(dataFolder, { recursive: true });

	let records = {};
	if (fs.existsSync(filePath)) {
		try {
			records = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} catch (err) {
			records = {};
		}
	}

	records[domain] = {
		domain,
		hitCount: (records[domain] && records[domain].hitCount ? records[domain].hitCount : 0) + 1,
		lastUrl: inputUrl,
		lastHit: new Date().toISOString(),
	};

	fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
	return records[domain];
}

function isUsableConfig(config) {
	return Boolean(
		config.titleSelector &&
		config.lastPageSelector &&
		config.writerNameSelector &&
		(config.postBodySelector || config.customPostExtractor)
	);
}

function cssAttributeEscape(value) {
	return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

module.exports = {
	getDomainConfig,
	recordUnsupportedDomain,
};
