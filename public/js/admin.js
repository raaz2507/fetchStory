const loginView = document.getElementById("loginView");
const adminView = document.getElementById("adminView");
const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserLabel = document.getElementById("currentUserLabel");
const loggingToggle = document.getElementById("loggingToggle");
const clearOutputsBtn = document.getElementById("clearOutputsBtn");
const scrapedCount = document.getElementById("scrapedCount");
const translatedCount = document.getElementById("translatedCount");
const outputCount = document.getElementById("outputCount");
const outputSize = document.getElementById("outputSize");
const userCount = document.getElementById("userCount");
const pendingCount = document.getElementById("pendingCount");
const logFiles = document.getElementById("logFiles");
const outputFiles = document.getElementById("outputFiles");
const scrapedRows = document.getElementById("scrapedRows");
const translatedRows = document.getElementById("translatedRows");
const addUserForm = document.getElementById("addUserForm");
const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newRole = document.getElementById("newRole");
const userRows = document.getElementById("userRows");
const moderationItems = document.getElementById("moderationItems");
const duplicateItems = document.getElementById("duplicateItems");
const exportStoreBtn = document.getElementById("exportStoreBtn");
const restoreStoreBtn = document.getElementById("restoreStoreBtn");
const storeJsonBox = document.getElementById("storeJsonBox");
const activityList = document.getElementById("activityList");
const toast = document.getElementById("toast");

let toastTimer = null;
let currentUser = null;
const eyeIcon = `<svg viewBox="0 0 640 640" aria-hidden="true"><path d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/></svg>`;
const eyeSlashIcon = `<svg viewBox="0 0 640 640" aria-hidden="true"><path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM120 221.9C110.6 212.5 95.4 212.5 86.1 221.9C76.8 231.3 76.7 246.5 86.1 255.8L360.2 530C369.6 539.4 384.8 539.4 394.1 530C403.4 520.6 403.5 505.4 394.1 496.1L120 221.9zM77.7 315.3C68.3 305.9 53.1 305.9 43.8 315.3C34.5 324.7 34.4 339.9 43.8 349.2L213.9 519.5C223.3 528.9 238.5 528.9 247.8 519.5C257.1 510.1 257.2 494.9 247.8 485.6L77.7 315.3z"/></svg>`;

refreshBtn.addEventListener("click", () => {
    loadAdminStatus("Status refreshed");
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        loginMessage.textContent = "";
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: loginUsername.value,
                password: loginPassword.value,
            }),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "Login failed");
        }

        currentUser = result.user;
        loginPassword.value = "";
        showAdminView();
        await loadAdminStatus("Login successful");
    } catch (err) {
        loginMessage.textContent = err.message || "Login failed";
    }
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-password-toggle]");
    if (!button) return;

    const passwordField = button.closest(".passwordField");
    const input = passwordField && passwordField.querySelector("input");
    if (!input) return;

    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.innerHTML = shouldShow ? eyeSlashIcon : eyeIcon;
    button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
    button.setAttribute("title", shouldShow ? "Hide password" : "Show password");
    button.classList.toggle("is-visible", shouldShow);
});

logoutBtn.addEventListener("click", async () => {
    try {
        await fetch("/api/admin/logout", { method: "POST" });
    } finally {
        currentUser = null;
        showLoginView();
    }
});

loggingToggle.addEventListener("change", async () => {
    try {
        loggingToggle.disabled = true;
        const response = await fetch("/api/admin/logging", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ enabled: loggingToggle.checked }),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "Logging update failed");
        }

        loggingToggle.checked = result.enabled;
        renderFileList(logFiles, result.files || []);
        showToast(result.enabled ? "Site log enabled" : "Site log disabled");
    } catch (err) {
        showToast(err.message || "Logging update failed");
        await loadAdminStatus();
    } finally {
        loggingToggle.disabled = false;
    }
});

clearOutputsBtn.addEventListener("click", async () => {
    if (!window.confirm("Translator outputs folder clear karna hai?")) return;

    try {
        clearOutputsBtn.disabled = true;
        clearOutputsBtn.textContent = "Clearing...";

        const response = await fetch("/api/admin/outputs", { method: "DELETE" });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "Outputs clear failed");
        }

        showToast(`${result.deletedCount || 0} output files deleted`);
        await loadAdminStatus();
    } catch (err) {
        showToast(err.message || "Outputs clear failed");
    } finally {
        clearOutputsBtn.disabled = false;
        clearOutputsBtn.textContent = "Clear Outputs";
    }
});

addUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: newUsername.value,
                password: newPassword.value,
                role: newRole.value,
            }),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "User create failed");
        }

        addUserForm.reset();
        newRole.value = "user";
        showToast("User added");
        await loadAdminStatus();
    } catch (err) {
        showToast(err.message || "User create failed");
    }
});

userRows.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-user-action]");
    if (!button) return;

    const row = button.closest("tr");
    const id = row.dataset.userId;
    const action = button.dataset.userAction;
    const roleSelect = row.querySelector("select");
    const passwordInput = row.querySelector("input[type='password']");

    try {
        const payload = {
            role: roleSelect.value,
        };
        if (passwordInput.value.trim()) {
            payload.password = passwordInput.value;
        }

        if (action === "toggle-block") {
            payload.blocked = button.dataset.blocked !== "true";
        }
        if (action === "approve") {
            payload.approved = true;
        }

        const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "User update failed");
        }

        showToast("User updated");
        await loadAdminStatus();
    } catch (err) {
        showToast(err.message || "User update failed");
    }
});

moderationItems.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-review]");
    if (!button) return;
    await reviewModeration(button.dataset.id, button.dataset.review);
});

exportStoreBtn.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/admin/store/export");
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "Export failed");
        }

        storeJsonBox.value = JSON.stringify(result.store, null, 2);
        showToast("Admin JSON exported");
    } catch (err) {
        showToast(err.message || "Export failed");
    }
});

restoreStoreBtn.addEventListener("click", async () => {
    if (!storeJsonBox.value.trim()) {
        showToast("Paste admin JSON first");
        return;
    }
    if (!window.confirm("Admin JSON restore karna hai? Current settings replace ho jayengi.")) return;

    try {
        const response = await fetch("/api/admin/store/restore", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ store: JSON.parse(storeJsonBox.value) }),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "Restore failed");
        }

        showToast("Admin JSON restored");
        await loadAdminStatus();
    } catch (err) {
        showToast(err.message || "Restore failed");
    }
});

checkSession();

async function checkSession() {
    try {
        const response = await fetch("/api/admin/session");
        const result = await response.json();

        if (!response.ok || result.error) {
            showLoginView();
            return;
        }

        currentUser = result.user;
        showAdminView();
        await loadAdminStatus();
    } catch (err) {
        showLoginView();
    }
}

function showLoginView() {
    loginView.hidden = false;
    adminView.hidden = true;
}

function showAdminView() {
    loginView.hidden = true;
    adminView.hidden = false;
    if (currentUserLabel && currentUser) {
        currentUserLabel.textContent = `${currentUser.username} (${currentUser.role})`;
    }
}

async function loadAdminStatus(message) {
    try {
        refreshBtn.disabled = true;
        const response = await fetch("/api/admin/status");
        const data = await response.json();

        if (!response.ok || data.error) {
            if (response.status === 401) {
                showLoginView();
                return;
            }
            throw new Error(data.error || "Admin status failed");
        }

        renderStatus(data);
        if (message) showToast(message);
    } catch (err) {
        showToast(err.message || "Admin status failed");
    } finally {
        refreshBtn.disabled = false;
    }
}

function renderStatus(data) {
    const scrapedStories = data.scrapedStories || [];
    const translatedStories = data.translatedStories || [];
    const outputs = data.outputs || {};
    const users = data.users || [];
    const moderation = data.moderation || {};

    currentUser = data.currentUser || currentUser;
    showAdminView();
    loggingToggle.checked = Boolean(data.logging && data.logging.enabled);
    scrapedCount.textContent = String(scrapedStories.length);
    translatedCount.textContent = String(translatedStories.length);
    outputCount.textContent = String(outputs.fileCount || 0);
    outputSize.textContent = formatBytes(outputs.sizeBytes || 0);
    userCount.textContent = String(users.length);
    pendingCount.textContent = String((moderation.pending || []).length);

    renderFileList(logFiles, data.logging && data.logging.files || []);
    renderFileList(outputFiles, outputs.files || []);
    renderUsers(users);
    renderModeration(moderation);
    renderActivity(data.activity || []);
    renderScrapedRows(scrapedStories);
    renderTranslatedRows(translatedStories);
}

function renderFileList(target, files) {
    if (!files.length) {
        target.innerHTML = `<li><span>No files</span><small>-</small></li>`;
        return;
    }

    target.innerHTML = files.map((file) => {
        return `
            <li>
                <span>${escapeHtml(file.name)}</span>
                <small>${formatBytes(file.sizeBytes)} | ${formatDate(file.updatedAt)}</small>
            </li>
        `;
    }).join("");
}

function renderScrapedRows(stories) {
    if (!stories.length) {
        scrapedRows.innerHTML = `<tr><td class="emptyRow" colspan="7">No scraped stories found in temp/jobs.</td></tr>`;
        return;
    }

    scrapedRows.innerHTML = stories.map((story) => {
        return `
            <tr>
                <td>
                    <div class="storyCell">
                        <span>${escapeHtml(story.storyName)}</span>
                        <small>${escapeHtml(story.url || story.jobId)}</small>
                    </div>
                </td>
                <td>${escapeHtml(story.writerName || "-")}</td>
                <td>${story.posts || 0}</td>
                <td>${story.lastPageNo || 0}/${story.totalPage || 0}</td>
                <td>${story.downloadedImages || 0}/${story.images || 0}</td>
                <td>${formatDate(story.completedAt || story.lastFetch || story.updatedAt)}</td>
                <td>${escapeHtml(story.duration || "-")}</td>
            </tr>
        `;
    }).join("");
}

function renderTranslatedRows(stories) {
    if (!stories.length) {
        translatedRows.innerHTML = `<tr><td class="emptyRow" colspan="6">No translated stories found in translator/outputs.</td></tr>`;
        return;
    }

    translatedRows.innerHTML = stories.map((story) => {
        const links = [
            story.translatedFile ? `<a href="${story.translatedFile}" target="_blank" rel="noopener">Story</a>` : "",
            story.notFoundFile ? `<a href="${story.notFoundFile}" target="_blank" rel="noopener">Not Found</a>` : "",
        ].filter(Boolean).join(" | ");

        return `
            <tr>
                <td>
                    <div class="storyCell">
                        <span>${escapeHtml(story.storyName)}</span>
                        <small>${escapeHtml(story.url || story.jobId)}</small>
                    </div>
                </td>
                <td>${escapeHtml(story.writerName || "-")}</td>
                <td>${story.hindiPosts || 0}/${story.englishPosts || 0}</td>
                <td>${formatDate(story.translatedAt)}</td>
                <td>${formatBytes(story.sizeBytes || 0)}</td>
                <td>${links || "-"}</td>
            </tr>
        `;
    }).join("");
}

function renderUsers(users) {
    if (!users.length) {
        userRows.innerHTML = `<tr><td class="emptyRow" colspan="6">No users found.</td></tr>`;
        return;
    }

    userRows.innerHTML = users.map((user) => {
        const disabledSelfBlock = currentUser && currentUser.id === user.id ? "disabled" : "";
        return `
            <tr data-user-id="${escapeHtml(user.id)}">
                <td>
                    <div class="storyCell">
                        <span>${escapeHtml(user.username)}</span>
                        <small>Created: ${formatDate(user.createdAt)}</small>
                    </div>
                </td>
                <td>
                    <select>
                        ${["admin", "editor", "user"].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`).join("")}
                    </select>
                </td>
                <td>${user.approved ? (user.blocked ? "Blocked" : "Active") : "Pending approval"}</td>
                <td>${formatDate(user.lastLoginAt)}</td>
                <td>
                    <div class="passwordField">
                        <input type="password" placeholder="Leave blank" />
                        <button class="passwordToggle" type="button" data-password-toggle aria-label="Show password" title="Show password">
                            ${eyeIcon}
                        </button>
                    </div>
                </td>
                <td class="buttonRow">
                    <button type="button" data-user-action="save">Save</button>
                    ${user.approved ? "" : `<button type="button" data-user-action="approve">Approve</button>`}
                    <button type="button" class="${user.blocked ? "" : "dangerBtn"}" data-user-action="toggle-block" data-blocked="${user.blocked}" ${disabledSelfBlock}>${user.blocked ? "Unblock" : "Block"}</button>
                </td>
            </tr>
        `;
    }).join("");
}

function renderModeration(moderation) {
    const pending = moderation.pending || [];
    const reported = moderation.reported || [];
    const merged = [...pending, ...reported.filter((item) => !pending.some((pendingItem) => pendingItem.id === item.id))];
    const duplicates = moderation.duplicates || [];

    moderationItems.innerHTML = merged.length
        ? merged.map((item) => {
            return `
                <article class="reviewItem">
                    <strong>${escapeHtml(item.title || "Pending item")}</strong>
                    <small>${escapeHtml(item.reason || item.type || "pending")}</small>
                    <div class="buttonRow">
                        <button type="button" data-review="approve" data-id="${escapeHtml(item.id)}">Approve</button>
                        <button type="button" class="dangerBtn" data-review="reject" data-id="${escapeHtml(item.id)}">Reject</button>
                    </div>
                </article>
            `;
        }).join("")
        : `<p class="emptyText">No pending or reported content.</p>`;

    duplicateItems.innerHTML = duplicates.length
        ? duplicates.map((item) => {
            return `
                <article class="reviewItem">
                    <strong>${escapeHtml(item.title || "Duplicate story")}</strong>
                    <small>${item.count} matching entries detected</small>
                </article>
            `;
        }).join("")
        : `<p class="emptyText">No duplicate stories detected.</p>`;
}

function renderActivity(items) {
    activityList.innerHTML = items.length
        ? items.map((item) => {
            return `
                <article>
                    <strong>${escapeHtml(item.type)}</strong>
                    <span>${escapeHtml(item.detail || "")}</span>
                    <small>${escapeHtml(item.actor || "-")} | ${formatDate(item.createdAt)}</small>
                </article>
            `;
        }).join("")
        : `<p class="emptyText">No activity yet.</p>`;
}

async function reviewModeration(id, action) {
    try {
        const response = await fetch(`/api/admin/moderation/${encodeURIComponent(id)}/review`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
        });
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.error || "Review failed");
        }

        showToast(`Content ${action}d`);
        await loadAdminStatus();
    } catch (err) {
        showToast(err.message || "Review failed");
    }
}

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
