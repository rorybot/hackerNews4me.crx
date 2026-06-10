import type { BgMessage } from "./types";
import { isSafeHttpUrl } from "./sanitize";

/**
 * Service worker: open URLs in background tabs only after URL validation.
 * Messages must come from this extension (Chrome enforces that for runtime
 * messaging from content scripts of this extension).
 */
chrome.runtime.onMessage.addListener(
  (message: BgMessage, _sender, sendResponse) => {
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
