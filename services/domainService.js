const fs = require("fs");
const path = require("path");

const domainConfigs = {
	"exforum.live": {
		engine: "xenforo",
		title: {
			selector: ".p-title-value",
		},
		pagination: {
			lastPageSelector: ".pageNav-main a",
		},
		writer: {
			selector: ".p-body-header .p-description ul li a.username",
		},
		posts: {
			containerSelector: "article[data-author]",
			authorAttribute: "data-author",
			bodySelector: ".message-inner .message-cell--main .message-main .message-content .message-userContent article.message-body.js-selectToQuote, article.message-body",
			idAttribute: "id",
		},
	},
	"xforum.live": null,
	"lustyweb.live": null,
	"xossipy.com": {
		engine: "mybb",
		title: {
			selector: "td.thead strong",
			position: "last",
		},
		pagination: {
			lastPageSelector: '.pagination a[href^="thread-"]',
		},
		writer: {
			selector: "#posts .post:first .author_information .largetext a",
		},
		posts: {
			containerSelector: "#posts > .post",
			authorSelector: ".author_information .largetext a",
			bodySelector: ".post_body",
			idAttribute: "id",
			idPrefix: "post_",
		},
	},
	"rajsharmastories.com": {
		engine: "phpbb",
		title: {
			selector: "h2.topic-title a, h2.topic-title",
		},
		pagination: {
			lastPageSelector: ".pagination a",
		},
		writer: {
			selector: ".post:first .postprofile a.username, .post:first .username",
		},
		posts: {
			containerSelector: ".post",
			authorSelector: ".postprofile a.username, .username",
			bodySelector: ".content",
			idAttribute: "id",
		},
	},
};
domainConfigs["xforum.live"] = domainConfigs["exforum.live"];
domainConfigs["lustyweb.live"] = domainConfigs["exforum.live"];

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
	const hasStructuredSelectors = Boolean(config.title && config.title.selector && config.pagination && config.pagination.lastPageSelector && config.writer && config.writer.selector && config.posts && config.posts.containerSelector && (config.posts.authorSelector || config.posts.authorAttribute) && config.posts.bodySelector);

	if (hasStructuredSelectors) return true;

	return Boolean(config.titleSelector && config.lastPageSelector && config.writerNameSelector && (config.postBodySelector || config.customPostExtractor));
}

module.exports = {
	getDomainConfig,
	recordUnsupportedDomain,
};
