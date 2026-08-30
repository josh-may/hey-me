const form = document.querySelector("form");
const input = document.querySelector("#idea");
const button = document.querySelector("button");
const status = document.querySelector(".status");

function showStatus(type = "", message = "") {
  status.className = `status${type ? ` status-${type}` : ""}`;
  status.replaceChildren();
  if (!message) return;

  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = type === "sent" ? "✓" : "!";
  status.append(mark, document.createTextNode(message));
}

function setSending(sending) {
  input.disabled = sending;
  button.disabled = sending || !input.value.trim();
  button.textContent = sending ? "sending..." : "send to hey →";
}

input.addEventListener("input", () => {
  setSending(false);
  showStatus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || input.disabled) return;

  setSending(true);
  showStatus();

  try {
    const response = await fetch("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not send your idea.");

    input.value = "";
    showStatus("sent", "Saved to HEY");
  } catch (error) {
    const message = error instanceof TypeError
      ? "Can't reach Hey Me. Check that Tailscale is connected, then try again."
      : error.message || "Could not send your idea.";
    showStatus("error", message);
  } finally {
    setSending(false);
    input.focus();
  }
});

const params = new URLSearchParams(window.location.search);
input.value = [params.get("text"), params.get("url")].filter(Boolean).join("\n\n");
setSending(false);
input.focus();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
