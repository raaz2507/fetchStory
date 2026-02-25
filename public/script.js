const contentDiv = document.getElementById("content");
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
    };
});

const downloadBtn = document.getElementById("downloadBtn");

downloadBtn.addEventListener("click", async () => {

    const contentHTML = document.querySelector("#content").innerHTML;

    const response = await fetch("/api/story/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            html: contentHTML,
            title: document.title
        })
    });

    if (response.ok) {
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "story.zip";
        link.click();
    } else {
        alert("Download failed");
    }

});