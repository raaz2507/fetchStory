const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const Database = require("../src/core/database/Database");
const AdminStoreRepository = require("../src/core/auth/AdminStoreRepository");
const AuthService = require("../src/core/auth/AuthService");

test("users and sessions survive a database reopen", () => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fetchstory-auth-"));
	const databasePath = path.join(folder, "users.sqlite");
	const initialDatabase = new Database(databasePath);
	const bootstrapAuth = new AuthService(null);
	const initialRepository = new AdminStoreRepository(initialDatabase, {
		defaultAdminUsername: "root",
		defaultAdminPasswordHash: bootstrapAuth.hashPassword("root-pass"),
	});
	const initialAuth = new AuthService(initialRepository);
	const userId = crypto.randomUUID();
	const store = initialRepository.loadStore();

	store.users.push({
		id: userId,
		username: "persistent-user",
		passwordHash: initialAuth.hashPassword("secret123"),
		role: "user",
		approved: true,
		blocked: false,
		createdAt: new Date().toISOString(),
		updatedAt: "",
		lastLoginAt: "",
	});
	initialRepository.saveStore(store);
	const createdSession = initialAuth.createSession(userId, "public");
	initialDatabase.close();

	const reopenedDatabase = new Database(databasePath);
	const reopenedRepository = new AdminStoreRepository(reopenedDatabase, {
		defaultAdminUsername: "root",
		defaultAdminPasswordHash: bootstrapAuth.hashPassword("root-pass"),
	});
	const reopenedAuth = new AuthService(reopenedRepository);
	const persistedUser = reopenedRepository.findUserByUsername("persistent-user");
	const persistedSession = reopenedAuth.getSession(createdSession.token, "public");

	assert.equal(persistedUser.id, userId);
	assert.equal(reopenedAuth.verifyPassword("secret123", persistedUser.passwordHash), true);
	assert.equal(persistedSession.user.id, userId);

	reopenedDatabase.close();
	fs.rmSync(folder, { recursive: true, force: true });
});

test("legacy admin JSON is imported only once", () => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fetchstory-legacy-"));
	const databasePath = path.join(folder, "users.sqlite");
	const legacyPath = path.join(folder, "admin-store.json");
	const bootstrapAuth = new AuthService(null);
	const passwordHash = bootstrapAuth.hashPassword("legacy-pass");

	fs.writeFileSync(legacyPath, JSON.stringify({
		settings: { fileLoggingEnabled: false },
		users: [{
			id: "legacy-user-id",
			username: "legacy-user",
			passwordHash,
			role: "admin",
			approved: true,
			blocked: false,
			createdAt: new Date().toISOString(),
		}],
		publicSessions: [],
		activity: [],
		moderation: [],
	}));

	const database = new Database(databasePath);
	const repository = new AdminStoreRepository(database, {
		legacyStorePath: legacyPath,
		defaultAdminPasswordHash: bootstrapAuth.hashPassword("fallback"),
	});
	assert.equal(repository.listUsers().length, 1);
	assert.equal(repository.findUserByUsername("legacy-user").id, "legacy-user-id");

	const changedLegacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
	changedLegacy.users.push({
		...changedLegacy.users[0],
		id: "should-not-import",
		username: "second-user",
	});
	fs.writeFileSync(legacyPath, JSON.stringify(changedLegacy));
	database.close();

	const reopenedDatabase = new Database(databasePath);
	const reopenedRepository = new AdminStoreRepository(reopenedDatabase, {
		legacyStorePath: legacyPath,
		defaultAdminPasswordHash: bootstrapAuth.hashPassword("fallback"),
	});
	assert.equal(reopenedRepository.listUsers().length, 1);

	reopenedDatabase.close();
	fs.rmSync(folder, { recursive: true, force: true });
});

test("audit activity is stored separately and capped", () => {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fetchstory-audit-"));
	const database = new Database(path.join(folder, "users.sqlite"));
	const auth = new AuthService(null);
	const repository = new AdminStoreRepository(database, {
		defaultAdminPasswordHash: auth.hashPassword("fallback"),
	});

	for (let index = 0; index < 260; index++) {
		repository.addActivity("user_action", "tester", `event-${index}`);
	}

	const activity = repository.listActivity(300);
	const tables = database.prepare(
		"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
	).all().map((row) => row.name);

	assert.equal(activity.length, 250);
	assert.equal(activity[0].detail, "event-259");
	assert.equal(tables.includes("technical_logs"), false);

	database.close();
	fs.rmSync(folder, { recursive: true, force: true });
});
