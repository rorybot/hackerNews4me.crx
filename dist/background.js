// src/sanitize.ts
function isSafeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// src/background.ts
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message?.type === "openBackgroundTab" && typeof message.url === "string") {
      if (!isSafeHttpUrl(message.url)) {
        sendResponse({ ok: false, reason: "blocked url" });
        return true;
      }
      chrome.tabs.create({ url: message.url, active: false });
      sendResponse({ ok: true });
      return true;
    }
    return false;
  }
);
//# sourceMappingURL=background.js.map
