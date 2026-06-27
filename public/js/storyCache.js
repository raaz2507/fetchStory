const SHARED_DB_NAME = "fetchStoryDB";
const SHARED_STORE_NAME = "storyCache";
const SHARED_RECORD_ID = "currentStory";
const SHARED_DB_VERSION = 2;
const PACKAGE_META_STORE = "packageMeta";
const PACKAGE_IMAGES_STORE = "packageImages";
const PACKAGE_RECORD_ID = "currentPackage";

const LEGACY_CACHES = [
    { dbName: "storyScraperDB", storeName: "cache", recordId: "lastStory", source: "index" },
    { dbName: "storyReaderDB", storeName: "cache", recordId: "lastStory", source: "reader" },
];

export class StoryCache {
    openDatabase(dbName = SHARED_DB_NAME, storeName = SHARED_STORE_NAME) {
        return new Promise((resolve, reject) => {
            const isSharedDb = dbName === SHARED_DB_NAME;
            const request = indexedDB.open(dbName, isSharedDb ? SHARED_DB_VERSION : 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (isSharedDb) {
                    [
                        SHARED_STORE_NAME,
                        PACKAGE_META_STORE,
                        PACKAGE_IMAGES_STORE,
                    ].forEach((name) => {
                        if (!db.objectStoreNames.contains(name)) {
                            db.createObjectStore(name, { keyPath: "id" });
                        }
                    });
                } else if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: "id" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async readRecord(dbName, storeName, recordId) {
        const db = await this.openDatabase(dbName, storeName);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).get(recordId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async writeRecord(record) {
        const db = await this.openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SHARED_STORE_NAME, "readwrite");
            tx.objectStore(SHARED_STORE_NAME).put(record);
            tx.oncomplete = () => {
                db.close();
                resolve(record);
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async save(storyData, options = {}) {
        if (!storyData) return null;

        if (options.source && options.source !== "fstory") {
            await this.clearPackageCache();
        }
        const existing = await this.load({ migrateLegacy: false });
        const now = new Date().toISOString();
        const record = {
            ...(existing || {}),
            id: SHARED_RECORD_ID,
            storyData,
            source: options.source || existing?.source || "unknown",
            appData: options.appData !== undefined ? options.appData : existing?.appData || null,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };
        return this.writeRecord(record);
    }

    async saveFstoryPackage(storyData, context, appData = {}) {
        if (!storyData || !context) return null;

        await this.clearPackageCache();
        const record = await this.save(storyData, {
            source: "fstory",
            appData: {
                packageStored: true,
                packageName: appData.packageName || context.sourceName || "story.fstory",
                contentFile: context.contentFile,
                cachedAt: new Date().toISOString(),
            },
        });

        const db = await this.openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([PACKAGE_META_STORE, PACKAGE_IMAGES_STORE], "readwrite");
            tx.objectStore(PACKAGE_META_STORE).put({
                id: PACKAGE_RECORD_ID,
                manifest: context.manifest,
                contentFile: context.contentFile,
                imageIndexFile: context.imageIndexFile,
                imagesFolder: context.imagesFolder,
                imageIndex: context.imageIndex,
                sourceName: appData.packageName || context.sourceName || "story.fstory",
                updatedAt: new Date().toISOString(),
            });
            const imageStore = tx.objectStore(PACKAGE_IMAGES_STORE);
            for (const [path, bytes] of context.images || []) {
                imageStore.put({ id: path, path, bytes });
            }
            tx.oncomplete = () => {
                db.close();
                resolve(record);
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async loadFstoryPackage() {
        const db = await this.openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([PACKAGE_META_STORE, PACKAGE_IMAGES_STORE], "readonly");
            const metaRequest = tx.objectStore(PACKAGE_META_STORE).get(PACKAGE_RECORD_ID);
            const imagesRequest = tx.objectStore(PACKAGE_IMAGES_STORE).getAll();
            tx.oncomplete = () => {
                db.close();
                const meta = metaRequest.result || null;
                if (!meta) {
                    resolve(null);
                    return;
                }
                const images = new Map(
                    (imagesRequest.result || []).map((entry) => [entry.path || entry.id, entry.bytes]),
                );
                resolve({ meta, images });
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async clearPackageCache() {
        const db = await this.openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([PACKAGE_META_STORE, PACKAGE_IMAGES_STORE], "readwrite");
            tx.objectStore(PACKAGE_META_STORE).clear();
            tx.objectStore(PACKAGE_IMAGES_STORE).clear();
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async load(options = {}) {
        const shared = await this.readRecord(SHARED_DB_NAME, SHARED_STORE_NAME, SHARED_RECORD_ID);
        if (shared || options.migrateLegacy === false) return shared;
        return this.migrateLegacyCache();
    }

    async migrateLegacyCache() {
        for (const legacy of LEGACY_CACHES) {
            const legacyRecord = await this.readRecord(legacy.dbName, legacy.storeName, legacy.recordId);
            if (!legacyRecord?.storyData) continue;

            const migrated = {
                id: SHARED_RECORD_ID,
                storyData: legacyRecord.storyData,
                source: legacy.source,
                appData: legacy.source === "index" ? legacyRecord : null,
                createdAt: legacyRecord.savedAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                migratedFrom: legacy.dbName,
            };
            await this.writeRecord(migrated);
            return migrated;
        }
        return null;
    }

    async deleteRecord(dbName, storeName, recordId) {
        const db = await this.openDatabase(dbName, storeName);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).delete(recordId);
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async clear() {
        await this.deleteRecord(SHARED_DB_NAME, SHARED_STORE_NAME, SHARED_RECORD_ID);
        await this.clearPackageCache();
        await Promise.all(
            LEGACY_CACHES.map((legacy) =>
                this.deleteRecord(legacy.dbName, legacy.storeName, legacy.recordId),
            ),
        );
    }
}

export default new StoryCache();
