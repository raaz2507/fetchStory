const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const axios = require("axios");
const { scrapeStoryWithImages, scrapeDeletedStoryQuotes } = require("../services/scraperService");

function createForumPage(posts, totalPages = 2) {
    return `
        <html>
            <h1 class="p-title-value">Test Story</h1>
            <div class="p-body-header">
                <div class="p-description"><ul><li><a class="username">story-author</a></li></ul></div>
            </div>
            <nav class="pageNav-main">
                <a href="/threads/test.1/">1</a>
                <a href="/threads/test.1/page-${totalPages}">${totalPages}</a>
            </nav>
            ${posts.map(({ id, html }) => `
                <article data-author="story-author" id="js-${id}">
                    <div class="message-inner">
                        <div class="message-cell--main">
                            <div class="message-main">
                                <div class="message-content">
                                    <div class="message-userContent">
                                        <article class="message-body js-selectToQuote">${html}</article>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            `).join("")}
        </html>
    `;
}

test("anchored XenForo page URLs are normalized and sticky posts are not duplicated", async () => {
    const originalGet = axios.get;
    const requestedUrls = [];
    const receivedPosts = [];

    axios.get = async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/page-2")) {
            return {
                data: createForumPage([
                    { id: "post-1", html: "INDEX" },
                    { id: "post-3", html: "Update two" },
                ]),
            };
        }

        return {
            data: createForumPage([
                { id: "post-1", html: "INDEX" },
                { id: "post-2", html: "Update one" },
            ]),
        };
    };

    try {
        const result = await scrapeStoryWithImages(
            "https://xforum.live/threads/test.1/page-996#post-999",
            "",
            ".",
            (progress) => {
                if (progress.html) receivedPosts.push(progress.html);
            },
            { loadImages: false },
        );

        assert.deepEqual(requestedUrls, [
            "https://xforum.live/threads/test.1/",
            "https://xforum.live/threads/test.1/page-2",
        ]);
        assert.equal(result.stats.matchedPosts, 3);
        assert.equal(receivedPosts.filter((html) => html.includes("INDEX")).length, 1);
        assert.equal(receivedPosts.some((html) => html.includes("Update one")), true);
        assert.equal(receivedPosts.some((html) => html.includes("Update two")), true);
    } finally {
        axios.get = originalGet;
    }
});

test("deleted-story scraper extracts expandable quote content for the author input", async () => {
    const originalGet = axios.get;
    const receivedPosts = [];

    axios.get = async () => ({
        data: `
            <html>
                <h1 class="p-title-value">Deleted Story Thread</h1>
                <div class="p-body-header">
                    <div class="p-description"><ul><li><a class="username">thread-owner</a></li></ul></div>
                </div>
                <nav class="pageNav-main"><a href="/threads/test.1/">1</a></nav>
                <article data-author="reader" id="js-post-200">
                    <article class="message-body js-selectToQuote">
                        <blockquote data-attributes="member: 59938" data-quote="honeysex" data-source="post: 10296470" class="bbCodeBlock bbCodeBlock--expandable bbCodeBlock--quote js-expandWatch is-expandable">
                            <div class="bbCodeBlock-title">
                                <a href="/goto/post?id=10296470" class="bbCodeBlock-sourceJump">honeysex said:</a>
                            </div>
                            <div class="bbCodeBlock-content">
                                <div class="bbCodeBlock-expandContent js-expandContent">
                                    Deleted story paragraph one.
                                </div>
                            </div>
                            <div class="bbCodeBlock-expandLink js-expandLink"><a role="button" tabindex="0">Click to expand...</a></div>
                        </blockquote>
                    </article>
                </article>
            </html>
        `,
    });

    try {
        const result = await scrapeDeletedStoryQuotes(
            "https://exforum.live/threads/test.1/page-16",
            "honeysex",
            ".",
            (progress) => {
                if (progress.html) receivedPosts.push(progress.html);
            },
            { loadImages: false },
        );

        assert.equal(result.stats.matchedPosts, 1);
        assert.equal(receivedPosts.length, 1);
        assert.equal(receivedPosts[0].includes("Deleted story paragraph one."), true);
        assert.equal(receivedPosts[0].includes("Click to expand"), false);
        assert.equal(receivedPosts[0].includes("honeysex said"), false);
    } finally {
        axios.get = originalGet;
    }
});

test("deleted-story scraper downloads quote images for fstory packaging", async () => {
    const originalGet = axios.get;
    const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), "fetchstory-deleted-"));
    const server = http.createServer((req, res) => {
        res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": "4",
        });
        res.end(Buffer.from([1, 2, 3, 4]));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const imageUrl = `http://127.0.0.1:${server.address().port}/deleted.jpg`;
    const receivedPosts = [];

    axios.get = async () => ({
        data: `
            <html>
                <h1 class="p-title-value">Deleted Story Thread</h1>
                <div class="p-body-header">
                    <div class="p-description"><ul><li><a class="username">thread-owner</a></li></ul></div>
                </div>
                <nav class="pageNav-main"><a href="/threads/test.1/">1</a></nav>
                <blockquote data-quote="honeysex" data-source="post: 10296470" class="bbCodeBlock bbCodeBlock--expandable bbCodeBlock--quote">
                    <div class="bbCodeBlock-title"><a class="bbCodeBlock-sourceJump" href="/goto/post?id=10296470">honeysex said:</a></div>
                    <div class="bbCodeBlock-content">
                        <img src="${imageUrl}" alt="deleted" />
                    </div>
                    <div class="bbCodeBlock-expandLink js-expandLink"><a role="button" tabindex="0">Click to expand...</a></div>
                </blockquote>
            </html>
        `,
    });

    try {
        const result = await scrapeDeletedStoryQuotes(
            "https://exforum.live/threads/test.1/page-16",
            "honeysex",
            tempFolder,
            (progress) => {
                if (progress.html) receivedPosts.push(progress.html);
            },
            { loadImages: true, publicBasePath: "/temp/jobs/test-job" },
        );

        const imageFiles = fs.readdirSync(path.join(tempFolder, "images"));
        assert.equal(result.stats.downloadedImages, 1);
        assert.equal(imageFiles.length, 1);
        assert.match(receivedPosts[0], /src="\/temp\/jobs\/test-job\/images\/[^"]+\.jpg"/);
        assert.match(receivedPosts[0], /data-original-src="http:\/\/127\.0\.0\.1:/);
    } finally {
        axios.get = originalGet;
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(tempFolder, { recursive: true, force: true });
    }
});
