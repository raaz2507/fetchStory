const { Dictionary } = require("./Hindi2EnglishDic");

class TransliterationEngine {
	constructor() {
		this.cache = new Map();
		this.notFoundWords = [];
		this.totalWordArr = [];
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
		const dic = this.#flattenDictionary(Dictionary);
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

module.exports = TransliterationEngine;
