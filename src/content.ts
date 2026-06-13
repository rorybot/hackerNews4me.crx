import { init } from "./app";

// Early paint: reduce white flash from stock HN while we boot.
(function early() {
  try {
    const s = document.createElement("style");
    s.textContent =
      "html,body{background:#1a1410!important} body>center,body>table{opacity:0!important}";
    (document.documentElement || document).appendChild(s);
  } catch {
    /* ignore */
  }
})();

(async function boot() {
  try {
    if (document.body) {
      await init();
    } else {
      await new Promise<void>((resolve) => {
        const done = () => {
          document.removeEventListener("DOMContentLoaded", done);
          resolve();
        };
        document.addEventListener("DOMContentLoaded", done);
      });
      await init();
    }
  } catch (err) {
    console.error("[hackerNews4me.ext] failed to start", err);
  }
})();
