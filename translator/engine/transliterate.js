const vm = require("vm");
const axios = require("axios");

const localDictionary = require("./Hindi2EnglishDic");

const githubDictionaryUrl = "https://raw.githubusercontent.com/raaz2507/English2Hindi-Transliteration/main/js/Hindi2EnglishDic.js";
let activeDictionary = localDictionary.Dictionary;
let dictionarySource = "local";
let dictionaryLoadPromise = null;

class TransliterationEngine {
	constructor() {
		this.cache = new Map();
		this.notFoundWords = [];
		this.totalWordArr = [];
	}

	static async initializeDictionary() {
		if (!dictionaryLoadPromise) {
			dictionaryLoadPromise = loadDictionaryFromGithub()
				.then((dictionary) => {
					activeDictionary = dictionary;
					dictionarySource = "github";
					return { source: dictionarySource };
				})
				.catch((err) => {
					activeDictionary = localDictionary.Dictionary;
					dictionarySource = "local";
					console.warn(`GitHub dictionary unavailable, using local dictionary: ${err.message}`);
					return { source: dictionarySource, error: err.message };
				});
		}

		return dictionaryLoadPromise;
	}

	static getDictionarySource() {
		return dictionarySource;
	}

	#protectHTML(input) {
		const map = new Map();
		let id = 0;

		const protectedText = input.replace(/<[^>]+>/g, (tag) => {
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

module.exports = TransliterationEngine;
