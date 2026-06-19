const crypto = require("crypto");
const fs = require("fs");

class AdminStoreRepository {
	constructor(database, options = {}) {
		this.database = database;
		this.legacyStorePath = options.legacyStorePath || "";
		this.defaultAdminUsername = options.defaultAdminUsername || "admin";
		this.defaultAdminPasswordHash = options.defaultAdminPasswordHash || "";
		this.initialize();
	}

	initialize() {
		this.database.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				username TEXT NOT NULL COLLATE NOCASE UNIQUE,
				password_hash TEXT NOT NULL,
				role TEXT NOT NULL DEFAULT 'user',
				approved INTEGER NOT NULL DEFAULT 0,
				blocked INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL DEFAULT '',
				last_login_at TEXT NOT NULL DEFAULT ''
			) STRICT;

			CREATE TABLE IF NOT EXISTS sessions (
				token_hash TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				session_type TEXT NOT NULL CHECK(session_type IN ('public', 'admin')),
				created_at TEXT NOT NULL,
				expires_at INTEGER NOT NULL,
				FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
			) STRICT;

			CREATE INDEX IF NOT EXISTS sessions_user_type_idx
			ON sessions(user_id, session_type);

			CREATE TABLE IF NOT EXISTS activity_logs (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				actor TEXT NOT NULL DEFAULT '',
				detail TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			) STRICT;

			CREATE INDEX IF NOT EXISTS activity_created_idx
			ON activity_logs(created_at DESC);

			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			) STRICT;

			CREATE TABLE IF NOT EXISTS moderation (
				id TEXT PRIMARY KEY,
				payload_json TEXT NOT NULL
			) STRICT;

			CREATE TABLE IF NOT EXISTS migrations (
				name TEXT PRIMARY KEY,
				applied_at TEXT NOT NULL
			) STRICT;
		`);

		this.removeExpiredSessions();
		this.importLegacyStoreOnce();
		this.ensureDefaultAdmin();
	}

	loadStore() {
		const settings = {};
		for (const row of this.database.prepare("SELECT key, value FROM settings").all()) {
			settings[row.key] = parseJsonValue(row.value);
		}

		const moderation = this.database.prepare(
			"SELECT payload_json FROM moderation ORDER BY rowid",
		).all().map((row) => JSON.parse(row.payload_json));

		return {
			settings: {
				fileLoggingEnabled: true,
				...settings,
			},
			users: this.listUsers(),
			publicSessions: [],
			activity: this.listActivity(250),
			moderation,
		};
	}

	saveStore(store) {
		const normalized = normalizeStore(store);
		this.database.transaction(() => {
			this.replaceUsers(normalized.users);
			this.replaceSettings(normalized.settings);
			this.replaceActivity(normalized.activity);
			this.replaceModeration(normalized.moderation);
		});
		return normalized;
	}

	restoreStore(store) {
		const normalized = normalizeStore(store);
		this.database.transaction(() => {
			this.database.exec("DELETE FROM sessions");
			this.database.exec("DELETE FROM users");
			this.replaceUsers(normalized.users);
			this.replaceSettings(normalized.settings);
			this.replaceActivity(normalized.activity);
			this.replaceModeration(normalized.moderation);
		});
		this.ensureDefaultAdmin();
		return normalized;
	}

	listUsers() {
		return this.database.prepare(`
			SELECT id, username, password_hash, role, approved, blocked,
				created_at, updated_at, last_login_at
			FROM users
			ORDER BY created_at ASC
		`).all().map(mapUser);
	}

	findUserById(id) {
		return mapUser(this.database.prepare(`
			SELECT id, username, password_hash, role, approved, blocked,
				created_at, updated_at, last_login_at
			FROM users WHERE id = ?
		`).get(id));
	}

	findUserByUsername(username) {
		return mapUser(this.database.prepare(`
			SELECT id, username, password_hash, role, approved, blocked,
				created_at, updated_at, last_login_at
			FROM users WHERE username = ? COLLATE NOCASE
		`).get(username));
	}

	createSession(token, userId, sessionType, expiresAt) {
		const now = new Date().toISOString();
		this.database.transaction(() => {
			this.database.prepare(
				"DELETE FROM sessions WHERE user_id = ? AND session_type = ?",
			).run(userId, sessionType);
			this.database.prepare(`
				INSERT INTO sessions(token_hash, user_id, session_type, created_at, expires_at)
				VALUES (?, ?, ?, ?, ?)
			`).run(hashToken(token), userId, sessionType, now, expiresAt);
		});
	}

	getSession(token, sessionType, extendTo = 0) {
		if (!token) return null;
		const tokenHash = hashToken(token);
		const row = this.database.prepare(`
			SELECT s.token_hash, s.user_id, s.session_type, s.created_at, s.expires_at,
				u.id, u.username, u.password_hash, u.role, u.approved, u.blocked,
				u.created_at AS user_created_at, u.updated_at, u.last_login_at
			FROM sessions s
			JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = ? AND s.session_type = ?
		`).get(tokenHash, sessionType);

		if (!row || Number(row.expires_at) <= Date.now()) {
			this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
			return null;
		}

		const expiresAt = extendTo > Number(row.expires_at) ? extendTo : Number(row.expires_at);
		if (expiresAt !== Number(row.expires_at)) {
			this.database.prepare(
				"UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
			).run(expiresAt, tokenHash);
		}

		return {
			user: mapUser({
				id: row.id,
				username: row.username,
				password_hash: row.password_hash,
				role: row.role,
				approved: row.approved,
				blocked: row.blocked,
				created_at: row.user_created_at,
				updated_at: row.updated_at,
				last_login_at: row.last_login_at,
			}),
			expiresAt,
		};
	}

	deleteSession(token) {
		if (!token) return;
		this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
	}

	removeExpiredSessions() {
		this.database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
	}

	listActivity(limit = 250) {
		return this.database.prepare(`
			SELECT id, type, actor, detail, created_at
			FROM activity_logs
			ORDER BY created_at DESC
			LIMIT ?
		`).all(limit).map((row) => ({
			id: row.id,
			type: row.type,
			actor: row.actor,
			detail: row.detail,
			createdAt: row.created_at,
		}));
	}

	importLegacyStoreOnce() {
		const migrationName = "legacy-admin-store-json";
		const alreadyImported = this.database.prepare(
			"SELECT 1 AS found FROM migrations WHERE name = ?",
		).get(migrationName);
		if (alreadyImported) return;

		let legacyStore = null;
		if (this.legacyStorePath && fs.existsSync(this.legacyStorePath)) {
			try {
				legacyStore = JSON.parse(fs.readFileSync(this.legacyStorePath, "utf8"));
			} catch (error) {
				console.warn("Legacy admin store import skipped:", error.message);
			}
		}

		this.database.transaction(() => {
			if (legacyStore && this.listUsers().length === 0) {
				const normalized = normalizeStore(legacyStore);
				this.replaceUsers(normalized.users);
				this.replaceSettings(normalized.settings);
				this.replaceActivity(normalized.activity);
				this.replaceModeration(normalized.moderation);

				for (const session of normalized.publicSessions) {
					if (!session.token || !session.userId || session.expiresAt <= Date.now()) continue;
					this.database.prepare(`
						INSERT OR REPLACE INTO sessions
						(token_hash, user_id, session_type, created_at, expires_at)
						VALUES (?, ?, 'public', ?, ?)
					`).run(
						hashToken(session.token),
						session.userId,
						session.createdAt || new Date().toISOString(),
						session.expiresAt,
					);
				}
			}

			this.database.prepare(
				"INSERT INTO migrations(name, applied_at) VALUES (?, ?)",
			).run(migrationName, new Date().toISOString());
		});
	}

	ensureDefaultAdmin() {
		const count = Number(
			this.database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
		);
		if (count > 0) return;

		this.database.prepare(`
			INSERT INTO users(
				id, username, password_hash, role, approved, blocked,
				created_at, updated_at, last_login_at
			) VALUES (?, ?, ?, 'admin', 1, 0, ?, '', '')
		`).run(
			crypto.randomUUID(),
			this.defaultAdminUsername,
			this.defaultAdminPasswordHash,
			new Date().toISOString(),
		);
	}

	replaceUsers(users) {
		const upsert = this.database.prepare(`
			INSERT INTO users(
				id, username, password_hash, role, approved, blocked,
				created_at, updated_at, last_login_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				username = excluded.username,
				password_hash = excluded.password_hash,
				role = excluded.role,
				approved = excluded.approved,
				blocked = excluded.blocked,
				updated_at = excluded.updated_at,
				last_login_at = excluded.last_login_at
		`);

		for (const user of users) {
			upsert.run(
				user.id,
				user.username,
				user.passwordHash,
				user.role,
				user.approved === false ? 0 : 1,
				user.blocked ? 1 : 0,
				user.createdAt || new Date().toISOString(),
				user.updatedAt || "",
				user.lastLoginAt || "",
			);
		}
	}

	replaceSettings(settings) {
		const upsert = this.database.prepare(`
			INSERT INTO settings(key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value
		`);
		for (const [key, value] of Object.entries(settings || {})) {
			upsert.run(key, JSON.stringify(value));
		}
	}

	replaceActivity(activity) {
		this.database.exec("DELETE FROM activity_logs");
		const insert = this.database.prepare(`
			INSERT INTO activity_logs(id, type, actor, detail, created_at)
			VALUES (?, ?, ?, ?, ?)
		`);
		for (const item of (activity || []).slice(0, 250)) {
			insert.run(
				item.id || crypto.randomUUID(),
				item.type || "activity",
				item.actor || "",
				item.detail || "",
				item.createdAt || new Date().toISOString(),
			);
		}
	}

	replaceModeration(moderation) {
		this.database.exec("DELETE FROM moderation");
		const insert = this.database.prepare(
			"INSERT INTO moderation(id, payload_json) VALUES (?, ?)",
		);
		for (const item of moderation || []) {
			const normalized = {
				...item,
				id: item.id || crypto.randomUUID(),
			};
			insert.run(normalized.id, JSON.stringify(normalized));
		}
	}
}

function mapUser(row) {
	if (!row) return null;
	return {
		id: row.id,
		username: row.username,
		passwordHash: row.password_hash,
		role: row.role,
		approved: Boolean(row.approved),
		blocked: Boolean(row.blocked),
		createdAt: row.created_at || "",
		updatedAt: row.updated_at || "",
		lastLoginAt: row.last_login_at || "",
	};
}

function normalizeStore(store = {}) {
	return {
		settings: {
			fileLoggingEnabled: true,
			...(store.settings || {}),
		},
		users: Array.isArray(store.users)
			? store.users.map((user) => ({
				...user,
				approved: user.approved !== false,
			}))
			: [],
		publicSessions: Array.isArray(store.publicSessions)
			? store.publicSessions.map((session) => ({
				...session,
				expiresAt: Number(session.expiresAt) || 0,
			}))
			: [],
		activity: Array.isArray(store.activity) ? store.activity.slice(0, 250) : [],
		moderation: Array.isArray(store.moderation) ? store.moderation : [],
	};
}

function hashToken(token) {
	return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function parseJsonValue(value) {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

module.exports = AdminStoreRepository;
