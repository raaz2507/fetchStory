const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

class Database {
	constructor(databasePath) {
		this.databasePath = databasePath;
		fs.mkdirSync(path.dirname(databasePath), { recursive: true });
		this.connection = new DatabaseSync(databasePath);
		this.connection.exec("PRAGMA foreign_keys = ON");
		this.connection.exec("PRAGMA journal_mode = WAL");
		this.connection.exec("PRAGMA busy_timeout = 5000");
	}

	exec(sql) {
		return this.connection.exec(sql);
	}

	prepare(sql) {
		return this.connection.prepare(sql);
	}

	transaction(work) {
		this.connection.exec("BEGIN IMMEDIATE");
		try {
			const result = work();
			this.connection.exec("COMMIT");
			return result;
		} catch (error) {
			this.connection.exec("ROLLBACK");
			throw error;
		}
	}

	close() {
		this.connection.close();
	}
}

module.exports = Database;
