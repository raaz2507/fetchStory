const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
    adminStoreRepository,
    authService,
} = require("../src/core/appServices");

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

exports.requireAdminAuth = (req, res, next) => {
    const session = getSessionFromRequest(req, "admin_session", "admin");

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

        const sessionUser = sanitizeUser(user);
        user.lastLoginAt = new Date().toISOString();
        await saveStore(store);
        const session = authService.createSession(user.id, "public");
        await addActivity("public_login_success", user.username, "Public app login");

        res.cookie("public_session", session.token, {
            httpOnly: true,
            path: "/",
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            maxAge: session.duration,
        });
        res.json({ ok: true, user: sessionUser });
    } catch (err) {
        res.status(500).json({ error: "Login failed: " + err.message });
    }
};

exports.publicLogout = async (req, res) => {
    const token = getCookie(req, "public_session");
    if (token) {
        authService.deleteSession(token);
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

        const sessionUser = sanitizeUser(user);
        user.lastLoginAt = new Date().toISOString();
        await saveStore(store);
        const session = authService.createSession(user.id, "admin");
        await addActivity("login_success", user.username, "Admin panel login");

        res.cookie("admin_session", session.token, {
            httpOnly: true,
            path: "/",
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            maxAge: session.duration,
        });
        res.json({ ok: true, user: sessionUser });
    } catch (err) {
        console.error("Admin login error:", err);
        res.status(500).json({ error: "Login failed: " + err.message });
    }
};

exports.logout = async (req, res) => {
    const token = getCookie(req, "admin_session");
    if (token) authService.deleteSession(token);
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

exports.deleteScrapedStory = async (req, res) => {
    try {
        const jobId = getValidScrapedJobId(req.params && req.params.jobId);
        const jobFolder = getScrapedJobFolder(jobId);

        if (!fs.existsSync(jobFolder)) {
            return res.status(404).json({ error: "Scraped story not found" });
        }

        await fs.promises.rm(jobFolder, { recursive: true, force: true });
        await addActivity("scraped_story_removed", req.adminUser.username, `${jobId} removed`);
        res.json({ ok: true, jobId, deletedCount: 1 });
    } catch (err) {
        console.error("Scraped story remove error:", err);
        res.status(err.statusCode || 500).json({ error: "Scraped story remove failed: " + err.message });
    }
};

exports.clearScrapedStories = async (req, res) => {
    try {
        const deletedJobIds = [];

        if (fs.existsSync(tempJobsFolder)) {
            const entries = await fs.promises.readdir(tempJobsFolder, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !isValidScrapedJobId(entry.name)) continue;

                const jobFolder = getScrapedJobFolder(entry.name);
                await fs.promises.rm(jobFolder, { recursive: true, force: true });
                deletedJobIds.push(entry.name);
            }
        }

        await addActivity("scraped_stories_cleared", req.adminUser.username, `${deletedJobIds.length} scraped stories removed`);
        res.json({
            ok: true,
            deletedCount: deletedJobIds.length,
            deletedJobIds,
        });
    } catch (err) {
        console.error("Scraped stories clear error:", err);
        res.status(500).json({ error: "Scraped stories clear failed: " + err.message });
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

exports.deleteUser = async (req, res) => {
	try {
		const user = adminStoreRepository.findUserById(req.params.id);
		if (!user) return res.status(404).json({ error: "User not found" });
		if (user.id === req.adminUser.id) {
			return res.status(400).json({ error: "Current admin user cannot remove itself" });
		}
		if (user.role === "admin" && adminStoreRepository.countUsersByRole("admin") <= 1) {
			return res.status(400).json({ error: "Last admin user cannot be removed" });
		}

		const deletedCount = adminStoreRepository.deleteUser(user.id);
		if (!deletedCount) return res.status(404).json({ error: "User not found" });

		await addActivity("user_removed", req.adminUser.username, `${user.username} removed`);
		res.json({ ok: true, user: sanitizeUser(user) });
	} catch (err) {
		console.error("Admin user remove error:", err);
		res.status(500).json({ error: "User remove failed: " + err.message });
	}
};

exports.clearActivity = async (req, res) => {
	try {
		const deletedCount = adminStoreRepository.clearActivity();
		res.json({ ok: true, deletedCount });
	} catch (err) {
		console.error("Admin activity clear error:", err);
		res.status(500).json({ error: "Activity clear failed: " + err.message });
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
        adminStoreRepository.restoreStore(store);
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
        const meta = story.meta || {};
        const fetchInfo = story.fetch || {};
        const stats = story.stats || {};

        stories.push({
            jobId,
            storyName: meta.storyName || story.storyName || story.title || "Untitled Story",
            writerName: meta.writerName || story.writerName || story.author || "",
            url: meta.url || story.url || "",
            posts: Object.keys(engPosts).length,
            totalPage: Number(fetchInfo.totalPage || story.totalPage || 0),
            lastPageNo: Number(fetchInfo.lastPageNo || 0),
            images: Number(stats.totalImages || 0),
            downloadedImages: Number(stats.imageDownloads || 0),
            startedAt: fetchInfo.startTime || "",
            completedAt: fetchInfo.endTime || "",
            duration: fetchInfo.durationText || "",
            lastFetch: fetchInfo.lastFetch || stat.mtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
        });
    }

    return stories.sort((a, b) => getTimeValue(b.lastFetch || b.updatedAt) - getTimeValue(a.lastFetch || a.updatedAt));
}

function isValidScrapedJobId(value) {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value || ""));
}

function getValidScrapedJobId(value) {
    const jobId = String(value || "").trim();
    if (!isValidScrapedJobId(jobId)) {
        const err = new Error("Valid scraped story jobId required");
        err.statusCode = 400;
        throw err;
    }
    return jobId;
}

function getScrapedJobFolder(jobId) {
    const jobsRoot = path.resolve(tempJobsFolder);
    const jobFolder = path.resolve(jobsRoot, jobId);
    if (path.dirname(jobFolder) !== jobsRoot) {
        const err = new Error("Unsafe scraped story path");
        err.statusCode = 400;
        throw err;
    }
    return jobFolder;
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
        const hindiPosts = story && story.posts
            ? (story.posts.hin || story.posts.hindi || {})
            : {};
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
    return adminStoreRepository.loadStore();
}

async function saveStore(store) {
    const normalizedStore = normalizeStore(store);
    Object.assign(store, normalizedStore);
    return adminStoreRepository.saveStore(normalizedStore);
}

function normalizeStore(store) {
    const users = Array.isArray(store.users) ? store.users.map((user) => ({
        ...user,
        approved: user.approved !== false,
    })) : [];

    return {
        settings: {
            fileLoggingEnabled: true,
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
    adminStoreRepository.addActivity(type, actor, detail);
}

function sanitizeUser(user) {
    return authService.sanitizeUser(user);
}

function normalizeUsername(value) {
    return authService.normalizeUsername(value);
}

function normalizeRole(value) {
    return authService.normalizeRole(value);
}

function hashPassword(password) {
    return authService.hashPassword(password);
}

function verifyPassword(password, passwordHash) {
    return authService.verifyPassword(password, passwordHash);
}

function getSessionFromRequest(req, cookieName, sessionType) {
    const token = getCookie(req, cookieName);
    return authService.getSession(token, sessionType);
}

async function getPublicSessionFromRequest(req) {
    const token = getCookie(req, "public_session");
    const session = authService.getSession(token, "public");
    if (!session) return null;

    const user = session.user;
    if (!user || user.blocked || user.approved === false) return null;

    return {
        user: sanitizeUser(user),
        expiresAt: session.expiresAt,
    };
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
