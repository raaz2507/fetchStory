const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
    isFileLoggingEnabled,
    setFileLoggingEnabled,
    serverLogPath,
    crashLogPath,
} = require("../utils/logger");

const rootFolder = path.join(__dirname, "..");
const tempJobsFolder = path.join(rootFolder, "temp", "jobs");
const outputsFolder = path.join(rootFolder, "translator", "outputs");
const logsFolder = path.join(rootFolder, "logs");
const dataFolder = path.join(rootFolder, "data");
const storePath = path.join(dataFolder, "admin-store.json");
const sessions = new Map();
const publicSessions = new Map();
const publicSessionDurationMs = 1000 * 60 * 60 * 24 * 7;

const defaultStore = {
    settings: {
        fileLoggingEnabled: true,
    },
    users: [],
    publicSessions: [],
    activity: [],
    moderation: [],
};

exports.requireAdminAuth = (req, res, next) => {
    const session = getSessionFromRequest(req);

    if (!session) {
        return res.status(401).json({ error: "Admin login required" });
    }

    req.adminUser = session.user;
    next();
};

exports.requirePublicAuth = async (req, res, next) => {
    const session = await getPublicSessionFromRequest(req);

    if (!session) {
        return res.status(401).json({ error: "Login required", loginUrl: "/login.html" });
    }

    const store = await getStore();
    const user = store.users.find((item) => item.id === session.user.id);
    if (!user || user.blocked || user.approved === false) {
        return res.status(403).json({ error: "User access not approved yet" });
    }

    req.publicUser = sanitizeUser(user);
    next();
};

exports.redirectToPublicLogin = async (req, res, next) => {
    const session = await getPublicSessionFromRequest(req);
    if (!session) return res.redirect(getPublicLoginUrl(req));

    const store = await getStore();
    const user = store.users.find((item) => item.id === session.user.id);
    if (!user || user.blocked || user.approved === false) return res.redirect(getPublicLoginUrl(req));

    req.publicUser = sanitizeUser(user);
    next();
};

exports.publicRegister = async (req, res) => {
    try {
        const store = await getStore();
        const username = normalizeUsername(req.body && req.body.username);
        const password = String(req.body && req.body.password || "");

        if (!username || password.length < 4) {
            return res.status(400).json({ error: "Username and 4+ character password required" });
        }
        if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ error: "Username already exists" });
        }

        const user = {
            id: crypto.randomUUID(),
            username,
            role: "user",
            blocked: false,
            approved: false,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
            lastLoginAt: "",
        };

        store.users.push(user);
        await saveStore(store);
        await addActivity("user_registered", username, "Waiting for admin approval");

        res.json({ ok: true, message: "Registration sent for admin approval" });
    } catch (err) {
        res.status(500).json({ error: "Register failed: " + err.message });
    }
};

exports.publicLogin = async (req, res) => {
    try {
        const store = await getStore();
        const username = String(req.body && req.body.username || "").trim();
        const password = String(req.body && req.body.password || "");
        const user = store.users.find((item) => item.username.toLowerCase() === username.toLowerCase());

        if (!user || !verifyPassword(password, user.passwordHash)) {
            await addActivity("public_login_failed", username || "unknown", "Invalid public login attempt");
            return res.status(401).json({ error: "Invalid username or password" });
        }
        if (user.blocked) return res.status(403).json({ error: "Your account is blocked" });
        if (user.approved === false) return res.status(403).json({ error: "Admin approval pending" });

        const token = crypto.randomBytes(32).toString("hex");
        const sessionUser = sanitizeUser(user);
        const expiresAt = Date.now() + publicSessionDurationMs;
        publicSessions.set(token, {
            user: sessionUser,
            expiresAt,
        });
        store.publicSessions = getActivePublicSessionRecords(store)
            .filter((session) => session.userId !== user.id && session.token !== token);
        store.publicSessions.push({
            token,
            userId: user.id,
            createdAt: new Date().toISOString(),
            expiresAt,
        });
        user.lastLoginAt = new Date().toISOString();
        await saveStore(store);
        await addActivity("public_login_success", user.username, "Public app login");

        res.cookie("public_session", token, {
            httpOnly: true,
            path: "/",
            sameSite: "strict",
            maxAge: publicSessionDurationMs,
        });
        res.json({ ok: true, user: sessionUser });
    } catch (err) {
        res.status(500).json({ error: "Login failed: " + err.message });
    }
};

exports.publicLogout = async (req, res) => {
    const token = getCookie(req, "public_session");
    if (token) {
        publicSessions.delete(token);
        const store = await getStore();
        store.publicSessions = getActivePublicSessionRecords(store)
            .filter((session) => session.token !== token);
        await saveStore(store);
    }
    res.clearCookie("public_session", { path: "/" });
    res.json({ ok: true });
};

exports.getPublicSession = async (req, res) => {
    const session = await getPublicSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: "Login required" });
    res.json({ ok: true, user: session.user });
};

exports.login = async (req, res) => {
    try {
        const store = await getStore();
        const username = String(req.body && req.body.username || "").trim();
        const password = String(req.body && req.body.password || "");
        const user = store.users.find((item) => item.username.toLowerCase() === username.toLowerCase());

        if (!user || user.blocked || user.approved === false || !verifyPassword(password, user.passwordHash)) {
            await addActivity("login_failed", username || "unknown", "Invalid admin login attempt");
            return res.status(401).json({ error: "Invalid username or password" });
        }

        if (!["admin", "editor"].includes(user.role)) {
            await addActivity("login_denied", user.username, "User role is not allowed in admin panel");
            return res.status(403).json({ error: "Admin access not allowed for this role" });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const sessionUser = sanitizeUser(user);
        sessions.set(token, {
            user: sessionUser,
            expiresAt: Date.now() + 1000 * 60 * 60 * 12,
        });
        user.lastLoginAt = new Date().toISOString();
        await saveStore(store);
        await addActivity("login_success", user.username, "Admin panel login");

        res.cookie("admin_session", token, {
            httpOnly: true,
            path: "/",
            sameSite: "strict",
            maxAge: 1000 * 60 * 60 * 12,
        });
        res.json({ ok: true, user: sessionUser });
    } catch (err) {
        console.error("Admin login error:", err);
        res.status(500).json({ error: "Login failed: " + err.message });
    }
};

exports.logout = async (req, res) => {
    const token = getCookie(req, "admin_session");
    if (token) sessions.delete(token);
    res.clearCookie("admin_session", { path: "/" });
    if (req.adminUser) {
        await addActivity("logout", req.adminUser.username, "Admin panel logout");
    }
    res.json({ ok: true });
};

exports.getSession = (req, res) => {
    res.json({ ok: true, user: req.adminUser });
};

exports.getAdminStatus = async (req, res) => {
    try {
        const [scrapedStories, translatedStories] = await Promise.all([
            listScrapedStories(),
            listTranslatedStories(),
        ]);
        const store = await getStore();
        store.settings.fileLoggingEnabled = isFileLoggingEnabled();
        await saveStore(store);

        res.json({
            ok: true,
            currentUser: req.adminUser,
            settings: store.settings,
            logging: {
                enabled: isFileLoggingEnabled(),
                files: getLogFiles(),
            },
            outputs: getFolderSummary(outputsFolder),
            scrapedStories,
            translatedStories,
            users: store.users.map(sanitizeUser),
            activity: store.activity.slice(0, 80),
            moderation: {
                pending: store.moderation.filter((item) => item.status === "pending"),
                reported: store.moderation.filter((item) => item.type === "reported" && item.status === "pending"),
                duplicates: findDuplicateStories([...scrapedStories, ...translatedStories]),
            },
        });
    } catch (err) {
        console.error("Admin status error:", err);
        res.status(500).json({ error: "Admin status failed: " + err.message });
    }
};

exports.updateLogging = async (req, res) => {
    try {
        const enabled = req.body && req.body.enabled === true;
        const nextEnabled = setFileLoggingEnabled(enabled);
        const store = await getStore();
        store.settings.fileLoggingEnabled = nextEnabled;
        await saveStore(store);
        await addActivity("setting_updated", req.adminUser.username, `Site log ${nextEnabled ? "enabled" : "disabled"}`);

        res.json({
            ok: true,
            enabled: nextEnabled,
            files: getLogFiles(),
        });
    } catch (err) {
        console.error("Admin logging update error:", err);
        res.status(500).json({ error: "Logging update failed: " + err.message });
    }
};

exports.clearOutputs = async (req, res) => {
    try {
        const before = getFolderSummary(outputsFolder);
        const deletedFiles = [];

        if (fs.existsSync(outputsFolder)) {
            for (const entry of await fs.promises.readdir(outputsFolder, { withFileTypes: true })) {
                if (!entry.isFile()) continue;

                const filePath = path.join(outputsFolder, entry.name);
                await fs.promises.rm(filePath, { force: true });
                deletedFiles.push(entry.name);
            }
        }

        res.json({
            ok: true,
            deletedCount: deletedFiles.length,
            deletedFiles,
            before,
            after: getFolderSummary(outputsFolder),
        });
        await addActivity("outputs_cleared", req.adminUser.username, `${deletedFiles.length} output files deleted`);
    } catch (err) {
        console.error("Admin outputs clear error:", err);
        res.status(500).json({ error: "Outputs clear failed: " + err.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const store = await getStore();
        const username = normalizeUsername(req.body && req.body.username);
        const password = String(req.body && req.body.password || "");
        const role = normalizeRole(req.body && req.body.role);

        if (!username || password.length < 4) {
            return res.status(400).json({ error: "Username and 4+ character password required" });
        }
        if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ error: "Username already exists" });
        }

        const user = {
            id: crypto.randomUUID(),
            username,
            role,
            blocked: false,
            approved: true,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
            lastLoginAt: "",
        };

        store.users.push(user);
        await saveStore(store);
        await addActivity("user_created", req.adminUser.username, `${username} created as ${role}`);

        res.json({ ok: true, user: sanitizeUser(user) });
    } catch (err) {
        console.error("Admin user create error:", err);
        res.status(500).json({ error: "User create failed: " + err.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const store = await getStore();
        const user = store.users.find((item) => item.id === req.params.id);

        if (!user) return res.status(404).json({ error: "User not found" });

        const nextRole = req.body && req.body.role ? normalizeRole(req.body.role) : user.role;
        const nextBlocked = typeof (req.body && req.body.blocked) === "boolean"
            ? req.body.blocked
            : user.blocked;
        const nextApproved = typeof (req.body && req.body.approved) === "boolean"
            ? req.body.approved
            : user.approved !== false;

        if (user.id === req.adminUser.id && nextBlocked) {
            return res.status(400).json({ error: "Current admin user cannot block itself" });
        }

        user.role = nextRole;
        user.blocked = nextBlocked;
        user.approved = nextApproved;
        if (req.body && req.body.password) {
            user.passwordHash = hashPassword(String(req.body.password));
        }
        user.updatedAt = new Date().toISOString();

        await saveStore(store);
        await addActivity("user_updated", req.adminUser.username, `${user.username} role=${user.role} approved=${user.approved !== false} blocked=${user.blocked}`);
        res.json({ ok: true, user: sanitizeUser(user) });
    } catch (err) {
        console.error("Admin user update error:", err);
        res.status(500).json({ error: "User update failed: " + err.message });
    }
};

exports.reviewModerationItem = async (req, res) => {
    try {
        const store = await getStore();
        const item = store.moderation.find((entry) => entry.id === req.params.id);
        const action = req.body && req.body.action === "reject" ? "rejected" : "approved";

        if (!item) return res.status(404).json({ error: "Moderation item not found" });

        item.status = action;
        item.reviewedBy = req.adminUser.username;
        item.reviewedAt = new Date().toISOString();

        await saveStore(store);
        await addActivity("moderation_reviewed", req.adminUser.username, `${item.title || item.id} ${action}`);
        res.json({ ok: true, item });
    } catch (err) {
        console.error("Moderation review error:", err);
        res.status(500).json({ error: "Moderation review failed: " + err.message });
    }
};

exports.exportStore = async (req, res) => {
    try {
        const store = await getStore();
        await addActivity("settings_exported", req.adminUser.username, "Admin JSON exported");
        res.json({
            ok: true,
            store: {
                ...store,
                users: store.users.map((user) => ({
                    ...sanitizeUser(user),
                    passwordHash: user.passwordHash,
                })),
            },
        });
    } catch (err) {
        res.status(500).json({ error: "Export failed: " + err.message });
    }
};

exports.restoreStore = async (req, res) => {
    try {
        const incoming = req.body && req.body.store;
        if (!incoming || typeof incoming !== "object") {
            return res.status(400).json({ error: "Valid admin store JSON required" });
        }

        const store = normalizeStore(incoming);
        await saveStore(store);
        setFileLoggingEnabled(store.settings.fileLoggingEnabled !== false);
        await addActivity("settings_restored", req.adminUser.username, "Admin JSON restored");
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: "Restore failed: " + err.message });
    }
};

async function listScrapedStories() {
    if (!fs.existsSync(tempJobsFolder)) return [];

    const entries = await fs.promises.readdir(tempJobsFolder, { withFileTypes: true });
    const stories = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const jobId = entry.name;
        const storyPath = path.join(tempJobsFolder, jobId, "story_data.json");
        const story = await readJsonFile(storyPath);
        if (!story) continue;

        const stat = await fs.promises.stat(storyPath);
        const engPosts = story.posts && story.posts.eng ? story.posts.eng : {};

        stories.push({
            jobId,
            storyName: story.storyName || story.title || "Untitled Story",
            writerName: story["writer-name"] || story.writerName || story.author || "",
            url: story.url || "",
            posts: Object.keys(engPosts).length,
            totalPage: Number(story.totalPage || 0),
            lastPageNo: Number(story["last-page-no"] || 0),
            images: Number(story["total-image"] || 0),
            downloadedImages: Number(story["image-downlaods"] || 0),
            startedAt: story["start-time"] || "",
            completedAt: story["end time"] || "",
            duration: story["duration taken"] || "",
            lastFetch: story.lastFetch || stat.mtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
        });
    }

    return stories.sort((a, b) => getTimeValue(b.lastFetch || b.updatedAt) - getTimeValue(a.lastFetch || a.updatedAt));
}

async function listTranslatedStories() {
    if (!fs.existsSync(outputsFolder)) return [];

    const entries = await fs.promises.readdir(outputsFolder, { withFileTypes: true });
    const translatedFiles = entries
        .filter((entry) => entry.isFile() && /^translated_story_.+\.json$/i.test(entry.name))
        .map((entry) => entry.name);
    const stories = [];

    for (const fileName of translatedFiles) {
        const filePath = path.join(outputsFolder, fileName);
        const story = await readJsonFile(filePath);
        const stat = await fs.promises.stat(filePath);
        const jobId = fileName.replace(/^translated_story_/i, "").replace(/\.json$/i, "");
        const engPosts = story && story.posts && story.posts.eng ? story.posts.eng : {};
        const hindiPosts = story && story.posts && story.posts.hindi ? story.posts.hindi : {};
        const notFoundName = `not_found_words_${jobId}.json`;
        const notFoundPath = path.join(outputsFolder, notFoundName);

        stories.push({
            jobId,
            storyName: story && (story.storyName || story.title) || "Translated Story",
            writerName: story && (story["writer-name"] || story.writerName || story.author) || "",
            url: story && story.url || "",
            englishPosts: Object.keys(engPosts).length,
            hindiPosts: Object.keys(hindiPosts).length,
            translatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
            translatedFile: `/translator/outputs/${fileName}`,
            notFoundFile: fs.existsSync(notFoundPath) ? `/translator/outputs/${notFoundName}` : "",
        });
    }

    return stories.sort((a, b) => getTimeValue(b.translatedAt) - getTimeValue(a.translatedAt));
}

async function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    } catch (err) {
        console.warn("Admin JSON read skipped:", filePath, err.message);
        return null;
    }
}

function getLogFiles() {
    if (!fs.existsSync(logsFolder)) return [];

    return fs.readdirSync(logsFolder)
        .filter((fileName) => fileName.endsWith(".log") || fileName.endsWith(".old"))
        .map((fileName) => {
            const filePath = path.join(logsFolder, fileName);
            const stat = fs.statSync(filePath);

            return {
                name: fileName,
                sizeBytes: stat.size,
                updatedAt: stat.mtime.toISOString(),
                active: filePath === serverLogPath || filePath === crashLogPath,
            };
        })
        .sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt));
}

function getFolderSummary(folderPath) {
    if (!fs.existsSync(folderPath)) {
        return {
            exists: false,
            fileCount: 0,
            sizeBytes: 0,
        };
    }

    const files = fs.readdirSync(folderPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
            const stat = fs.statSync(path.join(folderPath, entry.name));
            return {
                name: entry.name,
                sizeBytes: stat.size,
                updatedAt: stat.mtime.toISOString(),
            };
        });

    return {
        exists: true,
        fileCount: files.length,
        sizeBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
        files: files.sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt)),
    };
}

function getTimeValue(value) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : 0;
}

async function getStore() {
    await fs.promises.mkdir(dataFolder, { recursive: true });
    let store = null;

    try {
        if (fs.existsSync(storePath)) {
            store = JSON.parse(await fs.promises.readFile(storePath, "utf8"));
        }
    } catch (err) {
        console.warn("Admin store read failed, recreating:", err.message);
    }

    store = normalizeStore(store || defaultStore);
    if (!store.users.length) {
        store.users.push({
            id: crypto.randomUUID(),
            username: "admin",
            role: "admin",
            blocked: false,
            approved: true,
            passwordHash: hashPassword("admin123"),
            createdAt: new Date().toISOString(),
            lastLoginAt: "",
        });
    }

    await saveStore(store);
    return store;
}

async function saveStore(store) {
    await fs.promises.mkdir(dataFolder, { recursive: true });
    await fs.promises.writeFile(storePath, JSON.stringify(normalizeStore(store), null, 2));
}

function normalizeStore(store) {
    const users = Array.isArray(store.users) ? store.users.map((user) => ({
        ...user,
        approved: user.approved !== false,
    })) : [];

    return {
        settings: {
            ...defaultStore.settings,
            ...(store.settings || {}),
        },
        users,
        publicSessions: Array.isArray(store.publicSessions)
            ? store.publicSessions.filter((session) => {
                return session
                    && typeof session.token === "string"
                    && typeof session.userId === "string"
                    && Number(session.expiresAt) > Date.now();
            })
            : [],
        activity: Array.isArray(store.activity) ? store.activity.slice(0, 250) : [],
        moderation: Array.isArray(store.moderation) ? store.moderation : [],
    };
}

async function addActivity(type, actor, detail) {
    const store = await getStore();
    store.activity.unshift({
        id: crypto.randomUUID(),
        type,
        actor,
        detail,
        createdAt: new Date().toISOString(),
    });
    store.activity = store.activity.slice(0, 250);
    await saveStore(store);
}

function sanitizeUser(user) {
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

function normalizeUsername(value) {
    return String(value || "").trim().replace(/\s+/g, "_").slice(0, 40);
}

function normalizeRole(value) {
    return ["admin", "editor", "user"].includes(value) ? value : "user";
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
    return `pbkdf2_sha256$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
    const parts = String(passwordHash || "").split("$");
    if (parts.length !== 3 || parts[0] !== "pbkdf2_sha256") return false;

    const [, salt, storedHash] = parts;
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
    if (hash.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

function getSessionFromRequest(req, cookieName = "admin_session", sessionStore = sessions) {
    const token = getCookie(req, cookieName);
    if (!token) return null;

    const session = sessionStore.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessionStore.delete(token);
        return null;
    }

    session.expiresAt = Date.now() + 1000 * 60 * 60 * 12;
    return session;
}

async function getPublicSessionFromRequest(req) {
    const token = getCookie(req, "public_session");
    if (!token) return null;

    const cachedSession = publicSessions.get(token);
    if (cachedSession && cachedSession.expiresAt > Date.now()) {
        return cachedSession;
    }
    publicSessions.delete(token);

    const store = await getStore();
    const publicSession = getActivePublicSessionRecords(store)
        .find((session) => session.token === token);
    if (!publicSession) return null;

    const user = store.users.find((item) => item.id === publicSession.userId);
    if (!user || user.blocked || user.approved === false) return null;

    const session = {
        user: sanitizeUser(user),
        expiresAt: publicSession.expiresAt,
    };
    publicSessions.set(token, session);
    return session;
}

function getActivePublicSessionRecords(store) {
    return Array.isArray(store.publicSessions)
        ? store.publicSessions.filter((session) => Number(session.expiresAt) > Date.now())
        : [];
}

function getPublicLoginUrl(req) {
    const nextUrl = req.originalUrl && req.originalUrl !== "/login.html"
        ? req.originalUrl
        : "/";
    return `/login.html?next=${encodeURIComponent(nextUrl)}`;
}

function getCookie(req, name) {
    const cookies = String(req.headers.cookie || "").split(";").map((item) => item.trim());
    const match = cookies.find((item) => item.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function findDuplicateStories(stories) {
    const groups = new Map();

    stories.forEach((story) => {
        const key = String(story.url || story.storyName || "").trim().toLowerCase();
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({
            storyName: story.storyName || "Untitled Story",
            url: story.url || "",
            at: story.lastFetch || story.translatedAt || story.updatedAt || "",
        });
    });

    return [...groups.values()]
        .filter((group) => group.length > 1)
        .map((items) => ({
            id: crypto.createHash("sha1").update(items[0].url || items[0].storyName).digest("hex"),
            title: items[0].storyName,
            count: items.length,
            items,
        }));
}
