const vm = require("vm");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const localDictionary = require("./Hindi2EnglishDic");
// import {localDictionary: Dictionary} from "./Hindi2EnglishDic.js";

const githubDictionaryUrl =
	"https://raw.githubusercontent.com/raaz2507/English2Hindi-Transliteration/main/js/Hindi2EnglishDic.js";
const githubIgnoreWordsUrl =
	"https://raw.githubusercontent.com/raaz2507/English2Hindi-Transliteration/main/js/ignoreWoldList.js";

let activeDictionary = localDictionary.Dictionary;

console.log("localDictionary keys:", Object.keys(localDictionary));
console.log("Dictionary exists:", !!localDictionary.Dictionary);
console.log("localDictionary exists:", !!localDictionary.localDictionary);


let dictionarySource = "local";
let dictionaryLoadPromise = null;
let activeIgnoreWords = loadLocalIgnoreWords();
let ignoreWordsSource = "local";
let ignoreWordsLoadPromise = null;
let flatActiveDictionary = null;

class TransliterationEngine {
	constructor() {
		this.cache = new Map();
		this.notFoundWords = new Map();
		this.totalWords = 0;
		this.translatedWords = 0;
		this.ignoredWords = 0;
	}

	static async initializeDictionary() {
		if (!dictionaryLoadPromise) {
			dictionaryLoadPromise = Promise.all([
				loadDictionaryWithFallback(),
				loadIgnoreWordsWithFallback(),
			]).then(() => ({
				source: dictionarySource,
				ignoreWordsSource,
			}));
		}

		return dictionaryLoadPromise;
	}

	static getDictionarySource() {
		return dictionarySource;
	}

	static countWordsFromHtml(input) {
		const $ = cheerio.load(String(input || ""), { decodeEntities: false }, false);
		let count = 0;

		walkTextNodes($.root(), ($node) => {
			count += countWordsFromText($node[0].data || "");
		});

		return count;
	}

	convertHTML(input) {
		const $ = cheerio.load(String(input || ""), { decodeEntities: false }, false);

		walkTextNodes($.root(), ($node) => {
			const text = $node[0].data || "";
			$node[0].data = this.convertText(text);
		});

		return $.root().html() || "";
	}

	convertText(text) {
		return this.#tokenize(text)
			.map((token) => this.#translateToken(token))
			.join("");
	}

	getStats() {
		const notFoundWords = Object.fromEntries(
			Array.from(this.notFoundWords.entries()).sort((a, b) => b[1] - a[1]),
		);

		return {
			totalWords: this.totalWords,
			translatedWords: this.translatedWords,
			ignoredWords: this.ignoredWords,
			notFoundWords,
			notFoundCount: Object.keys(notFoundWords).length,
			notFoundTotal: Array.from(this.notFoundWords.values()).reduce(
				(sum, count) => sum + count,
				0,
			),
			conversionPercent: this.getConversionPercent(),
		};
	}

	getConversionPercent() {
		if (!this.totalWords) return 0;
		return Math.round((this.translatedWords / this.totalWords) * 100);
	}

	#tokenize(text) {
		return (
			String(text).match(/[\p{L}\p{M}_']+|\d+|\s+|[^\s\p{L}\p{M}_'\d]+/gu) ||
			[]
		);
	}

	#translateToken(token) {
		if (!isWordToken(token)) return token;

		const lower = token.toLowerCase();
		this.totalWords++;

		if (this.cache.has(lower)) {
			const cached = this.cache.get(lower);
			if (cached.translated) this.translatedWords++;
			if (cached.ignored) this.ignoredWords++;
			if (cached.notFound) {
				this.notFoundWords.set(
					lower,
					(this.notFoundWords.get(lower) || 0) + 1,
				);
			}
			return cached.output;
		}

		if (activeIgnoreWords.has(lower)) {
			this.ignoredWords++;
		this.cache.set(lower, {
			output: token,
			translated: false,
			ignored: true,
			notFound: false,
		});
		return token;
		}

		const translated = getFlatDictionary()[lower];
		if (translated) {
			this.translatedWords++;
			this.cache.set(lower, {
				output: translated,
				translated: true,
				ignored: false,
				notFound: false,
			});
			return translated;
		}

		this.notFoundWords.set(lower, (this.notFoundWords.get(lower) || 0) + 1);
		this.cache.set(lower, {
			output: token,
			translated: false,
			ignored: false,
			notFound: true,
		});
		return token;
	}
}

function walkTextNodes($nodes, onTextNode) {
	$nodes.each((_, node) => {
		const $node = cheerio.load("", null, false)(node);

		if (node.type === "text") {
			onTextNode($node);
			return;
		}

		if (node.type === "script" || node.type === "style") return;
		if (node.children && node.children.length) {
			walkTextNodes($node.contents(), onTextNode);
		}
	});
}

function isWordToken(token) {
	return /^[\p{L}\p{M}_']+$/u.test(token) && /[a-zA-Z]/.test(token);
}

function countWordsFromText(text) {
	return (String(text).match(/[\p{L}\p{M}_']+/gu) || []).filter((word) =>
		/[a-zA-Z]/.test(word),
	).length;
}

function getFlatDictionary() {
	if (flatActiveDictionary) return flatActiveDictionary;

	flatActiveDictionary = {};
	for (const group of Object.values(activeDictionary || {})) {
		Object.assign(flatActiveDictionary, group);
	}

	return flatActiveDictionary;
}

async function loadDictionaryFromGithub() {
	const response = await axios.get(githubDictionaryUrl, {
		responseType: "text",
		timeout: 15000,
		headers: {
			"User-Agent": "fetchStory-transliterator",
		},
	});

	const dictionary = evaluateDictionaryModule(response.data);

	if (!dictionary || typeof dictionary !== "object") {
		throw new Error("GitHub dictionary file did not export Dictionary");
	}

	return dictionary;
}

async function loadDictionaryWithFallback() {
	try {
		activeDictionary = await loadDictionaryFromGithub();
		dictionarySource = "github";
	} catch (err) {
		activeDictionary = localDictionary.Dictionary;
		dictionarySource = "local";
		console.warn(
			`GitHub dictionary unavailable, using local dictionary: ${err.message}`,
		);
	} finally {
		flatActiveDictionary = null;
	}
}

async function loadIgnoreWordsWithFallback() {
	if (!ignoreWordsLoadPromise) {
		ignoreWordsLoadPromise = loadIgnoreWordsFromGithub()
			.then((words) => {
				activeIgnoreWords = words;
				ignoreWordsSource = "github";
			})
			.catch((err) => {
				activeIgnoreWords = loadLocalIgnoreWords();
				ignoreWordsSource = "local";
				console.warn(
					`GitHub ignore word list unavailable, using local list: ${err.message}`,
				);
			});
	}

	return ignoreWordsLoadPromise;
}

async function loadIgnoreWordsFromGithub() {
	const response = await axios.get(githubIgnoreWordsUrl, {
		responseType: "text",
		timeout: 15000,
		headers: {
			"User-Agent": "fetchStory-transliterator",
		},
	});
	const words = evaluateIgnoreWordsModule(
		response.data,
		"ignoreWordList.github.js",
	);

	if (!(words instanceof Set) && !Array.isArray(words)) {
		throw new Error("GitHub ignore word list did not export ignoreWords");
	}

	return normalizeIgnoreWords(words);
}

function evaluateDictionaryModule(source) {
	const runnableSource = source
		.replace(/^\s*export\s+const\s+Dictionary\s*=/m, "const Dictionary =")
		.replace(/^\s*export\s*\{\s*Dictionary\s*\}\s*;?\s*$/m, "")
		.replace(/module\.exports\s*=\s*\{\s*Dictionary\s*\}\s*;?\s*$/m, "")
		.concat("\nmodule.exports = { Dictionary };\n");
	const sandbox = {
		module: { exports: {} },
		exports: {},
	};

	sandbox.exports = sandbox.module.exports;

	vm.runInNewContext(runnableSource, sandbox, {
		filename: "Hindi2EnglishDic.github.js",
		timeout: 5000,
	});

	return sandbox.module.exports.Dictionary || sandbox.Dictionary;
}

function loadLocalIgnoreWords() {
	const preferredPath = path.join(__dirname, "ignoreWordList.js");
	const legacyPath = path.join(__dirname, "ignoreWoldList.js");
	const ignorePath = fs.existsSync(preferredPath) ? preferredPath : legacyPath;

	try {
		const source = fs.readFileSync(ignorePath, "utf8");
		return normalizeIgnoreWords(
			evaluateIgnoreWordsModule(source, path.basename(ignorePath)),
		);
	} catch (err) {
		console.warn(`Ignore word list unavailable: ${err.message}`);
		return new Set();
	}
}

function evaluateIgnoreWordsModule(source, filename) {
	const runnableSource = source
		.replace(/^\s*export\s+const\s+ignoreWords\s*=/m, "const ignoreWords =")
		.replace(/^\s*export\s*\{\s*ignoreWords\s*\}\s*;?\s*$/m, "")
		.replace(/module\.exports\s*=\s*\{\s*ignoreWords\s*\}\s*;?\s*$/m, "")
		.concat(
			"\nif (typeof ignoreWords !== 'undefined') module.exports = { ignoreWords };\n",
		);
	const sandbox = {
		module: { exports: {} },
		exports: {},
		Set,
	};

	sandbox.exports = sandbox.module.exports;

	vm.runInNewContext(runnableSource, sandbox, {
		filename,
		timeout: 1000,
	});

	return sandbox.module.exports.ignoreWords || sandbox.ignoreWords;
}

function normalizeIgnoreWords(words) {
	const values = words instanceof Set ? Array.from(words) : words;

	if (!Array.isArray(values)) {
		return new Set();
	}

	return new Set(
		values
			.map((word) => String(word).trim().toLowerCase())
			.filter(Boolean),
	);
}

module.exports = TransliterationEngine;
