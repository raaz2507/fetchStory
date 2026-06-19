const path = require("path");

const Database = require("./database/Database");
const AdminStoreRepository = require("./auth/AdminStoreRepository");
const AuthService = require("./auth/AuthService");

const rootFolder = path.join(__dirname, "..", "..");
const dataFolder = process.env.FETCHSTORY_DATA_DIR
	? path.resolve(process.env.FETCHSTORY_DATA_DIR)
	: path.join(rootFolder, "data");
const databasePath = process.env.FETCHSTORY_DB_PATH
	? path.resolve(process.env.FETCHSTORY_DB_PATH)
	: path.join(dataFolder, "users.sqlite");
const legacyStorePath = path.join(dataFolder, "admin-store.json");

const bootstrapAuth = new AuthService(null);
const defaultAdminUsername = process.env.FETCHSTORY_ADMIN_USERNAME || "admin";
const defaultAdminPassword = process.env.FETCHSTORY_ADMIN_PASSWORD || "admin123";

const database = new Database(databasePath);
const adminStoreRepository = new AdminStoreRepository(database, {
	legacyStorePath,
	defaultAdminUsername,
	defaultAdminPasswordHash: bootstrapAuth.hashPassword(defaultAdminPassword),
});
const authService = new AuthService(adminStoreRepository);

module.exports = {
	database,
	databasePath,
	adminStoreRepository,
	authService,
};
