const crypto = require("crypto");

class AuthService {
	constructor(storeRepository, options = {}) {
		this.storeRepository = storeRepository;
		this.publicSessionDurationMs = options.publicSessionDurationMs || 1000 * 60 * 60 * 24 * 7;
		this.adminSessionDurationMs = options.adminSessionDurationMs || 1000 * 60 * 60 * 12;
	}

	hashPassword(password) {
		const salt = crypto.randomBytes(16).toString("hex");
		const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
		return `pbkdf2_sha256$${salt}$${hash}`;
	}

	verifyPassword(password, passwordHash) {
		const parts = String(passwordHash || "").split("$");
		if (parts.length !== 3 || parts[0] !== "pbkdf2_sha256") return false;

		const [, salt, storedHash] = parts;
		const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
		if (hash.length !== storedHash.length) return false;
		return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
	}

	createSession(userId, sessionType) {
		const token = crypto.randomBytes(32).toString("hex");
		const duration = sessionType === "admin"
			? this.adminSessionDurationMs
			: this.publicSessionDurationMs;
		const expiresAt = Date.now() + duration;
		this.storeRepository.createSession(token, userId, sessionType, expiresAt);
		return { token, expiresAt, duration };
	}

	getSession(token, sessionType) {
		const duration = sessionType === "admin"
			? this.adminSessionDurationMs
			: this.publicSessionDurationMs;
		return this.storeRepository.getSession(token, sessionType, Date.now() + duration);
	}

	deleteSession(token) {
		this.storeRepository.deleteSession(token);
	}

	sanitizeUser(user) {
		return {
			id: user.id,
			username: user.username,
			role: user.role,
			blocked: Boolean(user.blocked),
			approved: user.approved !== false,
			createdAt: user.createdAt || "",
			updatedAt: user.updatedAt || "",
			lastLoginAt: user.lastLoginAt || "",
		};
	}

	normalizeUsername(value) {
		return String(value || "").trim().replace(/\s+/g, "_").slice(0, 40);
	}

	normalizeRole(value) {
		return ["admin", "editor", "user"].includes(value) ? value : "user";
	}
}

module.exports = AuthService;
