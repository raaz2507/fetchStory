export class AdminDashboard {
    constructor() {
        this.loginView = document.getElementById("loginView");
        this.adminView = document.getElementById("adminView");
        this.loginForm = document.getElementById("loginForm");
        this.loginUsername = document.getElementById("loginUsername");
        this.loginPassword = document.getElementById("loginPassword");
        this.loginMessage = document.getElementById("loginMessage");
        this.refreshBtn = document.getElementById("refreshBtn");
        this.logoutBtn = document.getElementById("logoutBtn");
        this.currentUserLabel = document.getElementById("currentUserLabel");
        this.loggingToggle = document.getElementById("loggingToggle");
        this.clearOutputsBtn = document.getElementById("clearOutputsBtn");
        this.scrapedCount = document.getElementById("scrapedCount");
        this.translatedCount = document.getElementById("translatedCount");
        this.outputCount = document.getElementById("outputCount");
        this.outputSize = document.getElementById("outputSize");
        this.userCount = document.getElementById("userCount");
        this.pendingCount = document.getElementById("pendingCount");
        this.logFiles = document.getElementById("logFiles");
        this.outputFiles = document.getElementById("outputFiles");
        this.scrapedRows = document.getElementById("scrapedRows");
        this.clearScrapedStoriesBtn = document.getElementById("clearScrapedStoriesBtn");
        this.translatedRows = document.getElementById("translatedRows");
        this.addUserForm = document.getElementById("addUserForm");
        this.newUsername = document.getElementById("newUsername");
        this.newPassword = document.getElementById("newPassword");
        this.newRole = document.getElementById("newRole");
        this.userRows = document.getElementById("userRows");
        this.moderationItems = document.getElementById("moderationItems");
        this.duplicateItems = document.getElementById("duplicateItems");
        this.exportStoreBtn = document.getElementById("exportStoreBtn");
        this.restoreStoreBtn = document.getElementById("restoreStoreBtn");
        this.storeJsonBox = document.getElementById("storeJsonBox");
        this.activityList = document.getElementById("activityList");
        this.clearActivityBtn = document.getElementById("clearActivityBtn");
        this.toast = document.getElementById("toast");

        this.toastTimer = null;
        this.currentUser = null;
        this.eyeIcon = `<svg viewBox="0 0 640 640" aria-hidden="true"><path d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/></svg>`;
        this.eyeSlashIcon = `<svg viewBox="0 0 640 640" aria-hidden="true"><path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM120 221.9C110.6 212.5 95.4 212.5 86.1 221.9C76.8 231.3 76.7 246.5 86.1 255.8L360.2 530C369.6 539.4 384.8 539.4 394.1 530C403.4 520.6 403.5 505.4 394.1 496.1L120 221.9zM77.7 315.3C68.3 305.9 53.1 305.9 43.8 315.3C34.5 324.7 34.4 339.9 43.8 349.2L213.9 519.5C223.3 528.9 238.5 528.9 247.8 519.5C257.1 510.1 257.2 494.9 247.8 485.6L77.7 315.3z"/></svg>`;

        this.bindEvents();
    }

    bindEvents() {
        this.refreshBtn.addEventListener("click", () => {
            this.loadAdminStatus("Status refreshed");
        });

        this.loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                this.loginMessage.textContent = "";
                const response = await fetch("/api/admin/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        username: this.loginUsername.value,
                        password: this.loginPassword.value,
                    }),
                });
                const result = await response.json();

                if (!response.ok || result.error) {
                    throw new Error(result.error || "Login failed");
                }

                this.currentUser = result.user;
                this.loginPassword.value = "";
                this.showAdminView();
                await this.loadAdminStatus("Login successful");
            } catch (err) {
                this.loginMessage.textContent = err.message || "Login failed";
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
            button.innerHTML = shouldShow ? this.eyeSlashIcon : this.eyeIcon;
            button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
            button.setAttribute("title", shouldShow ? "Hide password" : "Show password");
            button.classList.toggle("is-visible", shouldShow);
        });

        this.logoutBtn.addEventListener("click", async () => {
            try {
                await fetch("/api/admin/logout", { method: "POST" });
            } finally {
                this.currentUser = null;
                this.showLoginView();
            }
        });

        this.loggingToggle.addEventListener("change", async () => {
            try {
                this.loggingToggle.disabled = true;
                const response = await fetch("/api/admin/logging", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ enabled: this.loggingToggle.checked }),
                });
                const result = await response.json();

                if (!response.ok || result.error) {
                    throw new Error(result.error || "Logging update failed");
                }

                this.loggingToggle.checked = result.enabled;
                this.renderFileList(this.logFiles, result.files || []);
                this.showToast(result.enabled ? "Site log enabled" : "Site log disabled");
            } catch (err) {
                this.showToast(err.message || "Logging update failed");
                await this.loadAdminStatus();
            } finally {
                this.loggingToggle.disabled = false;
            }
        });

        this.clearOutputsBtn.addEventListener("click", async () => {
            if (!window.confirm("Translator outputs folder clear karna hai?")) return;

            try {
                this.clearOutputsBtn.disabled = true;
                this.clearOutputsBtn.textContent = "Clearing...";

                const response = await fetch("/api/admin/outputs", { method: "DELETE" });
                const result = await response.json();

                if (!response.ok || result.error) {
                    throw new Error(result.error || "Outputs clear failed");
                }

                this.showToast(`${result.deletedCount || 0} output files deleted`);
                await this.loadAdminStatus();
            } catch (err) {
                this.showToast(err.message || "Outputs clear failed");
            } finally {
                this.clearOutputsBtn.disabled = false;
                this.clearOutputsBtn.textContent = "Clear Outputs";
            }
        });

        this.clearScrapedStoriesBtn.addEventListener("click", async () => {
            if (!window.confirm("Saari scraped stories permanently clear karni hain?")) return;

            try {
                this.clearScrapedStoriesBtn.disabled = true;
                this.clearScrapedStoriesBtn.textContent = "Clearing...";
                const response = await fetch("/api/admin/scraped-stories", { method: "DELETE" });
                const result = await response.json();
                if (!response.ok || result.error) {
                    throw new Error(result.error || "Scraped stories clear failed");
                }
                this.showToast(`${result.deletedCount || 0} scraped stories deleted`);
                await this.loadAdminStatus();
            } catch (err) {
                this.showToast(err.message || "Scraped stories clear failed");
            } finally {
                this.clearScrapedStoriesBtn.disabled = false;
                this.clearScrapedStoriesBtn.textContent = "Clear All";
            }
        });

        this.scrapedRows.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-scraped-delete]");
            if (!button) return;

            const jobId = button.dataset.scrapedDelete;
            const storyName = button.dataset.storyName || "this story";
            if (!window.confirm(`${storyName} ko permanently delete karna hai?`)) return;

            try {
                button.disabled = true;
                button.textContent = "Deleting...";
                const response = await fetch(`/api/admin/scraped-stories/${encodeURIComponent(jobId)}`, {
                    method: "DELETE",
                });
                const result = await response.json();
                if (!response.ok || result.error) {
                    throw new Error(result.error || "Scraped story delete failed");
                }
                this.showToast("Scraped story deleted");
                await this.loadAdminStatus();
            } catch (err) {
                button.disabled = false;
                button.textContent = "Delete";
                this.showToast(err.message || "Scraped story delete failed");
            }
        });

        this.clearActivityBtn.addEventListener("click", async () => {
            if (!window.confirm("Saari user activity permanently clear karni hai?")) return;

            try {
                this.clearActivityBtn.disabled = true;
                this.clearActivityBtn.textContent = "Clearing...";
                const response = await fetch("/api/admin/activity", { method: "DELETE" });
                const result = await response.json();
                if (!response.ok || result.error) {
                    throw new Error(result.error || "Activity clear failed");
                }
                this.showToast(`${result.deletedCount || 0} activity entries cleared`);
                await this.loadAdminStatus();
            } catch (err) {
                this.showToast(err.message || "Activity clear failed");
            } finally {
                this.clearActivityBtn.disabled = false;
                this.clearActivityBtn.textContent = "Clear Activity";
            }
        });

        this.addUserForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                const response = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        username: this.newUsername.value,
                        password: this.newPassword.value,
                        role: this.newRole.value,
                    }),
                });
                const result = await response.json();

                if (!response.ok || result.error) {
                    throw new Error(result.error || "User create failed");
                }

                this.addUserForm.reset();
                this.newRole.value = "user";
                this.showToast("User added");
                await this.loadAdminStatus();
            } catch (err) {
                this.showToast(err.message || "User create failed");
            }
        });

        this.userRows.addEventListener("click", async (event) => {
            const button = event.target.closest("button[data-user-action]");
            if (!button) return;

            const row = button.closest("tr");
            const id = row.dataset.userId;
            const action = button.dataset.userAction;
            const roleSelect = row.querySelector("select");
            const passwordInput = row.querySelector("input[type='password']");

            try {
                if (action === "remove") {
                    const username = row.querySelector(".storyCell span")?.textContent || "this user";
                    if (!window.confirm(`${username} ko permanently remove karna hai?`)) return;

                    const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
                        method: "DELETE",
                    });
                    const result = await response.json();
                    if (!response.ok || result.error) {
                        throw new Error(result.error || "User remove failed");
                    }
                    this.showToast("User removed");
                    await this.loadAdminStatus();
                    return;
                }

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

                this.showToast("User updated");
                await this.loadAdminStatus();
            } catch (err) {
                this.showToast(err.message || "User update failed");
            }
        });

        this.moderationItems.addEventListener("click", async (event) => {
            const button = event.target.closest("button[data-review]");
            if (!button) return;
            await this.reviewModeration(button.dataset.id, button.dataset.review);
        });

        this.exportStoreBtn.addEventListener("click", async () => {
            try {
                const response = await fetch("/api/admin/store/export");
                const result = await response.json();

                if (!response.ok || result.error) {
                    throw new Error(result.error || "Export failed");
                }

                this.storeJsonBox.value = JSON.stringify(result.store, null, 2);
                this.showToast("Admin JSON exported");
            } catch (err) {
                this.showToast(err.message || "Export failed");
            }
        });

        this.restoreStoreBtn.addEventListener("click", async () => {
            if (!this.storeJsonBox.value.trim()) {
                this.showToast("Paste admin JSON first");
                return;
            }
            if (!window.confirm("Admin JSON restore karna hai? Current settings replace ho jayengi.")) return;

            try {
                const response = await fetch("/api/admin/store/restore", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ store: JSON.parse(this.storeJsonBox.value) }),
                });
                const result = await response.json();

                if (!response.ok || result.error) {
                    throw new Error(result.error || "Restore failed");
                }

                this.showToast("Admin JSON restored");
                await this.loadAdminStatus();
            } catch (err) {
                this.showToast(err.message || "Restore failed");
            }
        });
    }

    async checkSession() {
        try {
            const response = await fetch("/api/admin/session");
            const result = await response.json();

            if (!response.ok || result.error) {
                this.showLoginView();
                return;
            }

            this.currentUser = result.user;
            this.showAdminView();
            await this.loadAdminStatus();
        } catch (err) {
            this.showLoginView();
        }
    }

    showLoginView() {
        this.loginView.hidden = false;
        this.adminView.hidden = true;
    }

    showAdminView() {
        this.loginView.hidden = true;
        this.adminView.hidden = false;
        if (this.currentUserLabel && this.currentUser) {
            this.currentUserLabel.textContent = `${this.currentUser.username} (${this.currentUser.role})`;
        }
    }

    async loadAdminStatus(message) {
        try {
            this.refreshBtn.disabled = true;
            const response = await fetch("/api/admin/status");
            const data = await response.json();

            if (!response.ok || data.error) {
                if (response.status === 401) {
                    this.showLoginView();
                    return;
                }
                throw new Error(data.error || "Admin status failed");
            }

            this.renderStatus(data);
            if (message) this.showToast(message);
        } catch (err) {
            this.showToast(err.message || "Admin status failed");
        } finally {
            this.refreshBtn.disabled = false;
        }
    }

    renderStatus(data) {
        const scrapedStories = data.scrapedStories || [];
        const translatedStories = data.translatedStories || [];
        const outputs = data.outputs || {};
        const users = data.users || [];
        const moderation = data.moderation || {};

        this.currentUser = data.currentUser || this.currentUser;
        this.showAdminView();
        this.loggingToggle.checked = Boolean(data.logging && data.logging.enabled);
        this.scrapedCount.textContent = String(scrapedStories.length);
        this.translatedCount.textContent = String(translatedStories.length);
        this.outputCount.textContent = String(outputs.fileCount || 0);
        this.outputSize.textContent = this.formatBytes(outputs.sizeBytes || 0);
        this.userCount.textContent = String(users.length);
        this.pendingCount.textContent = String((moderation.pending || []).length);

        this.renderFileList(this.logFiles, data.logging && data.logging.files || []);
        this.renderFileList(this.outputFiles, outputs.files || []);
        this.renderUsers(users);
        this.renderModeration(moderation);
        this.renderActivity(data.activity || []);
        this.renderScrapedRows(scrapedStories);
        this.renderTranslatedRows(translatedStories);
    }

    renderFileList(target, files) {
        if (!files.length) {
            target.innerHTML = `<li><span>No files</span><small>-</small></li>`;
            return;
        }

        target.innerHTML = files.map((file) => {
            return `
                <li>
                    <span>${this.escapeHtml(file.name)}</span>
                    <small>${this.formatBytes(file.sizeBytes)} | ${this.formatDate(file.updatedAt)}</small>
                </li>
            `;
        }).join("");
    }

    renderScrapedRows(stories) {
        if (!stories.length) {
            this.scrapedRows.innerHTML = `<tr><td class="emptyRow" colspan="8">No scraped stories found in temp/jobs.</td></tr>`;
            return;
        }

        this.scrapedRows.innerHTML = stories.map((story) => {
            return `
                <tr>
                    <td>
                        <div class="storyCell">
                            <span>${this.escapeHtml(story.storyName)}</span>
                            <small>${this.escapeHtml(story.url || story.jobId)}</small>
                        </div>
                    </td>
                    <td>${this.escapeHtml(story.writerName || "-")}</td>
                    <td>${story.posts || 0}</td>
                    <td>${story.lastPageNo || 0}/${story.totalPage || 0}</td>
                    <td>${story.downloadedImages || 0}/${story.images || 0}</td>
                    <td>${this.formatDate(story.completedAt || story.lastFetch || story.updatedAt)}</td>
                    <td>${this.escapeHtml(story.duration || "-")}</td>
                    <td>
                        <button
                            type="button"
                            class="dangerBtn"
                            data-scraped-delete="${this.escapeHtml(story.jobId)}"
                            data-story-name="${this.escapeHtml(story.storyName)}"
                        >Delete</button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    renderTranslatedRows(stories) {
        if (!stories.length) {
            this.translatedRows.innerHTML = `<tr><td class="emptyRow" colspan="6">No translated stories found in translator/outputs.</td></tr>`;
            return;
        }

        this.translatedRows.innerHTML = stories.map((story) => {
            const links = [
                story.translatedFile ? `<a href="${story.translatedFile}" target="_blank" rel="noopener">Story</a>` : "",
                story.notFoundFile ? `<a href="${story.notFoundFile}" target="_blank" rel="noopener">Not Found</a>` : "",
            ].filter(Boolean).join(" | ");

            return `
                <tr>
                    <td>
                        <div class="storyCell">
                            <span>${this.escapeHtml(story.storyName)}</span>
                            <small>${this.escapeHtml(story.url || story.jobId)}</small>
                        </div>
                    </td>
                    <td>${this.escapeHtml(story.writerName || "-")}</td>
                    <td>${story.hindiPosts || 0}/${story.englishPosts || 0}</td>
                    <td>${this.formatDate(story.translatedAt)}</td>
                    <td>${this.formatBytes(story.sizeBytes || 0)}</td>
                    <td>${links || "-"}</td>
                </tr>
            `;
        }).join("");
    }

    renderUsers(users) {
        if (!users.length) {
            this.userRows.innerHTML = `<tr><td class="emptyRow" colspan="6">No users found.</td></tr>`;
            return;
        }

        this.userRows.innerHTML = users.map((user) => {
            const disabledSelfBlock = this.currentUser && this.currentUser.id === user.id ? "disabled" : "";
            const disabledSelfRemove = this.currentUser && this.currentUser.id === user.id ? "disabled" : "";
            return `
                <tr data-user-id="${this.escapeHtml(user.id)}">
                    <td>
                        <div class="storyCell">
                            <span>${this.escapeHtml(user.username)}</span>
                            <small>Created: ${this.formatDate(user.createdAt)}</small>
                        </div>
                    </td>
                    <td>
                        <select>
                            ${["admin", "editor", "user"].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`).join("")}
                        </select>
                    </td>
                    <td>${user.approved ? (user.blocked ? "Blocked" : "Active") : "Pending approval"}</td>
                    <td>${this.formatDate(user.lastLoginAt)}</td>
                    <td>
                        <div class="passwordField">
                            <input type="password" placeholder="Leave blank" />
                            <button class="passwordToggle" type="button" data-password-toggle aria-label="Show password" title="Show password">
                                ${this.eyeIcon}
                            </button>
                        </div>
                    </td>
                    <td class="buttonRow">
                        <button type="button" data-user-action="save">Save</button>
                        ${user.approved ? "" : `<button type="button" data-user-action="approve">Approve</button>`}
                        <button type="button" class="${user.blocked ? "" : "dangerBtn"}" data-user-action="toggle-block" data-blocked="${user.blocked}" ${disabledSelfBlock}>${user.blocked ? "Unblock" : "Block"}</button>
                        <button type="button" class="dangerBtn" data-user-action="remove" ${disabledSelfRemove}>Remove</button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    renderModeration(moderation) {
        const pending = moderation.pending || [];
        const reported = moderation.reported || [];
        const merged = [...pending, ...reported.filter((item) => !pending.some((pendingItem) => pendingItem.id === item.id))];
        const duplicates = moderation.duplicates || [];

        this.moderationItems.innerHTML = merged.length
            ? merged.map((item) => {
                return `
                    <article class="reviewItem">
                        <strong>${this.escapeHtml(item.title || "Pending item")}</strong>
                        <small>${this.escapeHtml(item.reason || item.type || "pending")}</small>
                        <div class="buttonRow">
                            <button type="button" data-review="approve" data-id="${this.escapeHtml(item.id)}">Approve</button>
                            <button type="button" class="dangerBtn" data-review="reject" data-id="${this.escapeHtml(item.id)}">Reject</button>
                        </div>
                    </article>
                `;
            }).join("")
            : `<p class="emptyText">No pending or reported content.</p>`;

        this.duplicateItems.innerHTML = duplicates.length
            ? duplicates.map((item) => {
                return `
                    <article class="reviewItem">
                        <strong>${this.escapeHtml(item.title || "Duplicate story")}</strong>
                        <small>${item.count} matching entries detected</small>
                    </article>
                `;
            }).join("")
            : `<p class="emptyText">No duplicate stories detected.</p>`;
    }

    renderActivity(items) {
        this.activityList.innerHTML = items.length
            ? items.map((item) => {
                return `
                    <article>
                        <strong>${this.escapeHtml(item.type)}</strong>
                        <span>${this.escapeHtml(item.detail || "")}</span>
                        <small>${this.escapeHtml(item.actor || "-")} | ${this.formatDate(item.createdAt)}</small>
                    </article>
                `;
            }).join("")
            : `<p class="emptyText">No activity yet.</p>`;
    }

    async reviewModeration(id, action) {
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

            this.showToast(`Content ${action}d`);
            await this.loadAdminStatus();
        } catch (err) {
            this.showToast(err.message || "Review failed");
        }
    }

    formatBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
        return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
    }

    formatDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";

        return date.toLocaleString();
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add("is-visible");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toast.classList.remove("is-visible");
        }, 2600);
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const adminDashboard = new AdminDashboard();
    adminDashboard.checkSession();
});
