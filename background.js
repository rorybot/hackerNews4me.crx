// Open a URL in a new background tab (does not steal focus).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "openBackgroundTab" && message.url) {
    chrome.tabs.create({ url: message.url, active: false });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
