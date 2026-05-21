const contentDiv = document.getElementById("content");
const storyTitle = document.querySelector(".storyTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

document.getElementById("fetchBtn").addEventListener("click", () => {
    contentDiv.innerHTML = "";
    storyTitle.textContent = "";
    progressBar.value = 0;
    progressText.textContent = "0%";

    const url = document.getElementById("urlInput").value.trim();
    const author = document.getElementById("authorName").value.trim();
    const startPage = document.getElementById("startPage").value;
    const endPage = document.getElementById("endPage").value;

    const params = new URLSearchParams({ url, author });
    if (startPage) params.set("startPage", startPage);
    if (endPage) params.set("endPage", endPage);

    const eventSource = new EventSource(`/api/story?${params.toString()}`);

    eventSource.onerror = (err) => {
        console.error("SSE error", err);
        eventSource.close();
        progressText.textContent = "Connection error";
    };

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            eventSource.close();
            progressText.textContent = data.error;
            return;
        }

        if (data.done) {
            eventSource.close();
            return;
        }

        progressBar.value = data.percent;
        progressText.textContent =
            `Page ${data.currentPage}/${data.totalPages} | ${data.percent}% | Blocks: ${data.checksum}`;

        if (data.html) {
            contentDiv.innerHTML = data.html;
        }

        if (data.title && storyTitle.textContent === "") {
            storyTitle.textContent = data.title;
        }
    };
});

document.getElementById("downloadBtn").addEventListener("click", function() {
    const contentArea = document.querySelector(".contentArea");
    const clone = contentArea.cloneNode(true);
    const images = clone.querySelectorAll("img");
    const promises = [];

    images.forEach((img) => {
        const promise = fetch(img.src)
            .then((res) => res.blob())
            .then((blob) => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    img.src = reader.result;
                    resolve();
                };
                reader.readAsDataURL(blob);
            }));
        promises.push(promise);
    });

    Promise.all(promises).then(() => {
        const htmlContent =
`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Saved Story</title>
    <style>
        .contentArea{
            width: 98%;
            margin: 1rem auto 2rem;
        }
        .contentArea .storyTitle{
            text-align: center;
            margin: 5px auto 10px;
        }
        .contentArea #content{
            width: 95%;
            max-width: 210mm;
            margin: 1rem auto 1rem;
            min-height: 1rem;
            padding: 3rem 2.5rem;
            border: 1px solid rgba(0, 0, 0, 0.186);
            border-radius: 3px;
            box-shadow: 2px 2px 13px -3px rgba(0, 0, 0, 0.619);
            text-align: justify;
            font-size: 1rem;
        }
    </style>
</head>
<body>${clone.outerHTML}</body>
</html>`;

        const blob = new Blob([htmlContent], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const title = storyTitle.textContent.trim() || "story";

        a.href = url;
        a.download = `${title}.html`;
        a.click();
        URL.revokeObjectURL(url);
    });
});
