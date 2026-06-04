const vm = require("vm");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const localDictionary = require("./Hindi2EnglishDic");

const githubDictionaryUrl = "https://raw.githubusercontent.com/raaz2507/English2Hindi-Transliteration/main/js/Hindi2EnglishDic.js";
const githubIgnoreWordsUrl = "https://raw.githubusercontent.com/raaz2507/English2Hindi-Transliteration/main/js/ignoreWoldList.js";
let activeDictionary = localDictionary.Dictionary;
let dictionarySource = "local";
let dictionaryLoadPromise = null;
let activeIgnoreWords = loadLocalIgnoreWords();
let ignoreWordsSource = "local";
let ignoreWordsLoadPromise = null;

class TransliterationEngine {
	constructor() {
		this.cache = new Map();
		this.notFoundWords = [];
		this.totalWordArr = [];
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

	#protectHTML(input) {
		const map = new Map();
		let id = 0;

		const protectedText = input.replace(/<[^>]+>|&(?:[a-zA-Z][\w-]*|#\d+|#x[\da-fA-F]+);/g, (tag) => {
			const key = `@@HTML_${id++}@@`;
			map.set(key, tag);
			return key;
		});

		return { text: protectedText, map };
	}
	#restoreHTML(text, map) {
		for (let [key, value] of map.entries()) {
			text = text.replaceAll(key, value);
		}
		return text;
	}
	#tokenize(text) {
		return (
			text.match(
				/@@HTML_\d+@@|[\p{L}\p{M}_']+|\d+|[.,!?;:"()\n\t]|./gu
			) || []
		);
	}

	#flattenDictionary(dic) {
		if (this.flatDic) return this.flatDic;

		this.flatDic = {};

		for (let group in dic) {
			Object.assign(this.flatDic, dic[group]);
		}

		return this.flatDic;
	}

	#translate(tokens) {
		const dic = this.#flattenDictionary(activeDictionary);
		let output = [];

		for (let token of tokens) {
			let lower = token.toLowerCase();

			// cache hit
			if (this.cache.has(lower)) {
				output.push(this.cache.get(lower));
				continue;
			}

			// skip HTML tokens
			if (token.startsWith("@@HTML_")) {
				output.push(token);
				continue;
			}

			if (activeIgnoreWords.has(lower)) {
				output.push(token);
				continue;
			}

			let translated = dic[lower];

			if (translated) {
				this.cache.set(lower, translated);
				output.push(translated);
			} else {
				output.push(token);

				if (/^[a-zA-Z]+$/.test(token)) {
					this.notFoundWords.push(token);
				}
			}
		}

		return output;
	}

	#join(tokens) {
		const noSpaceBefore = /^[.,!?;:)]$/;
		const noSpaceAfter = /^[("]$/;

		let result = "";

		for (let i = 0; i < tokens.length; i++) {
			let curr = tokens[i];
			let prev = tokens[i - 1];

			if (curr === "\n" || curr === "\t") {
				result += curr;
				continue;
			}

			if (!prev) {
				result += curr;
				continue;
			}

			if (noSpaceBefore.test(curr)) {
				result = result.trimEnd() + curr;
			} else if (noSpaceAfter.test(prev)) {
				result += curr;
			} else {
				result += " " + curr;
			}
		}

		return result.trim();
	}
	
	convertHTML(input) {
		// 1. protect HTML
		const { text, map } = this.#protectHTML(input);

		// 2. tokenize
		const tokens = this.#tokenize(text);

		// 3. translate
		const translated = this.#translate(tokens);

		// 4. rebuild text
		const joined = this.#join(translated);

		// 5. restore HTML
		return this.#restoreHTML(joined, map);
	}
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
		console.warn(`GitHub dictionary unavailable, using local dictionary: ${err.message}`);
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
				console.warn(`GitHub ignore word list unavailable, using local list: ${err.message}`);
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
	const words = evaluateIgnoreWordsModule(response.data, "ignoreWoldList.github.js");

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
	const ignorePath = path.join(__dirname, "ignoreWoldList.js");

	try {
		const source = fs.readFileSync(ignorePath, "utf8");
		return normalizeIgnoreWords(
			evaluateIgnoreWordsModule(source, "ignoreWoldList.js"),
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
