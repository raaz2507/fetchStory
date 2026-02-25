const contentDiv = document.getElementById("content");
const storyTitle = document.querySelector(".storyTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");


document.getElementById("fetchBtn").addEventListener("click", () => {

    contentDiv.innerHTML = "";
    progressBar.value = 0;

    const url = document.getElementById("urlInput").value;
    const author = document.getElementById("authorName").value;

    const eventSource = new EventSource(
        `/api/story?url=${encodeURIComponent(url)}&author=${encodeURIComponent(author)}`
    );
    eventSource.onerror = (err) => {
        console.error("SSE error", err);
        eventSource.close();
        progressText.textContent = "❌ Connection error";
    };
    
    eventSource.onmessage = (event) => {

        const data = JSON.parse(event.data);

        if (data.done) {
            eventSource.close();
            return;
        }

        // ✅ Update progress
        progressBar.value = data.percent;
        progressText.textContent =
            `Page ${data.currentPage}/${data.totalPages} | ${data.percent}% | Blocks: ${data.checksum}`;

        // ✅ Append content live
        if (data.html) {
            contentDiv.insertAdjacentHTML("beforeend", data.html);
        }

        // ✅ Story title set
        if (data.title && storyTitle.textContent === "") {
            storyTitle.textContent = data.title;
        }
    };
});

const downloadBtn = document.getElementById("downloadBtn");

// downloadBtn.addEventListener("click", async () => {

//     const contentHTML = document.querySelector("#content").innerHTML;

//     const response = await fetch("/api/story/download", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//             html: contentHTML,
//             title: document.title
//         })
//     });

//     if (response.ok) {
//         const blob = await response.blob();
//         const link = document.createElement("a");
//         link.href = URL.createObjectURL(blob);
//         link.download = "story.zip";
//         link.click();
//     } else {
//         alert("Download failed");
//     }

// });
downloadBtn.addEventListener("click", function() {
    // Clone element
    const contentArea = document.querySelector(".contentArea");

    const clone = contentArea.cloneNode(true);
    
    // Convert all img src to base64 so they work offline
    const images = clone.querySelectorAll("img");
    const promises = [];

    images.forEach(img => {
        const promise = fetch(img.src)
            .then(res => res.blob())
            .then(blob => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    img.src = reader.result; // base64
                    resolve();
                };
                reader.readAsDataURL(blob);
            }));
        promises.push(promise);
    });

    Promise.all(promises).then(() => {
        // Wrap in full HTML
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

        // Create blob and download
        const blob = new Blob([htmlContent], { type: "text/html" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${storyTitle.textContent}.html`;
        a.click();
        URL.revokeObjectURL(url);
    });
});