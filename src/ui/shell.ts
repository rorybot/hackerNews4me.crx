// @ts-nocheck
import { createBanner } from "./banner";

const NAV = [
  { href: "/", label: "Top", list: "top" },
  { href: "/newest", label: "New", list: "new" },
  { href: "/best", label: "Best", list: "best" },
  { href: "/ask", label: "Ask", list: "ask" },
  { href: "/show", label: "Show", list: "show" },
  { href: "/jobs", label: "Jobs", list: "job" },
];

/**
 * @param {{ activeList?: string, user?: string|null, onNav?: (href: string) => void }} opts
 */
export function renderShell(opts = {}) {
  const root = document.createElement("div");
  root.id = "sandy-hn";

  // Chill-hop pixel art — set on :root so body + glass panels share one backdrop
  const bgUrl = chrome.runtime.getURL("assets/chill-bg.svg");
  const bgValue = `url("${bgUrl}")`;
  document.documentElement.style.setProperty("--shn-bg-image", bgValue);
  root.style.setProperty("--shn-bg-image", bgValue);

  root.innerHTML = `
    <div class="shn-bg" aria-hidden="true"></div>
    <div class="shn-column">
      <div class="shn-banner-slot"></div>
      <header class="shn-header">
        <div class="shn-brand">
          <span class="shn-logo" aria-hidden="true">HN</span>
          <span class="shn-title">hackerNews4me.ext</span>
        </div>
        <nav class="shn-nav" role="navigation"></nav>
        <div class="shn-meta">
          <span class="shn-user"></span>
          <button type="button" class="shn-help-btn" title="Keyboard shortcuts (?)">?</button>
        </div>
      </header>
      <div class="shn-status" hidden></div>
      <main class="shn-main"></main>
    </div>
    <div class="shn-undo-toast" hidden>
      <div class="shn-undo-toast-inner">
        <div class="shn-undo-toast-msg">
          <span class="shn-undo-toast-label">hidden</span>
          <span class="shn-undo-toast-title"></span>
        </div>
        <button type="button" class="shn-undo-toast-btn" title="Undo hide (u)">undo · u</button>
        <div class="shn-undo-toast-bar" aria-hidden="true"></div>
      </div>
    </div>
    <div class="shn-help" hidden>
      <div class="shn-help-panel">
        <h2>Keyboard shortcuts</h2>
        <dl>
          <dt>j / k</dt><dd>Next / previous item</dd>
          <dt>Enter</dt><dd>Open comments</dd>
          <dt>l / o</dt><dd>Open story (background tab)</dd>
          <dt>a</dt><dd>Upvote (or click ▲)</dd>
          <dt>x</dt><dd>Hide story (undo window)</dd>
          <dt>u</dt><dd>Undo hide (while glowing)</dd>
          <dt>h</dt><dd>Collapse comment (thread)</dd>
          <dt>r</dt><dd>Refresh</dd>
          <dt>g then h</dt><dd>Go to Top</dd>
          <dt>g then n</dt><dd>Go to Newest</dd>
          <dt>g then a</dt><dd>Go to Ask</dd>
          <dt>g then s</dt><dd>Go to Show</dd>
          <dt>g then j</dt><dd>Go to Jobs</dd>
          <dt>?</dt><dd>Toggle this help</dd>
        </dl>
        <p style="margin:0 0 0.75rem;font-size:0.85rem;color:var(--ink-muted)">
          Drag column bars to resize. Click <strong>PTS</strong> to sort by points
          (approx. last 72h sample) — click again for feed order.
        </p>
        <button type="button" class="shn-help-close">Close</button>
      </div>
    </div>
  `;

  // Pitchside LED billboard + England next match
  const slot = root.querySelector(".shn-banner-slot");
  slot.replaceWith(createBanner());

  const nav = root.querySelector(".shn-nav");
  for (const item of NAV) {
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    a.className = "shn-nav-link";
    if (opts.activeList && opts.activeList === item.list) {
      a.classList.add("is-active");
    }
    a.addEventListener("click", (e) => {
      e.preventDefault();
      opts.onNav?.(item.href);
    });
    nav.appendChild(a);
  }

  const userEl = root.querySelector(".shn-user");
  if (opts.user) {
    userEl.textContent = opts.user;
    userEl.title = "Logged into HN";
  } else {
    userEl.innerHTML = `<a href="https://news.ycombinator.com/login" class="shn-login">Log in</a>`;
  }

  const help = root.querySelector(".shn-help");
  const toggleHelp = () => {
    help.hidden = !help.hidden;
  };
  root.querySelector(".shn-help-btn").addEventListener("click", toggleHelp);
  root.querySelector(".shn-help-close").addEventListener("click", toggleHelp);
  help.addEventListener("click", (e) => {
    if (e.target === help) toggleHelp();
  });

  const undoToast = root.querySelector(".shn-undo-toast");
  const undoTitle = root.querySelector(".shn-undo-toast-title");
  const undoBar = root.querySelector(".shn-undo-toast-bar");
  const undoBtn = root.querySelector(".shn-undo-toast-btn");
  /** @type {null | (() => void)} */
  let undoHandler = null;

  undoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    undoHandler?.();
  });

  return {
    root,
    main: root.querySelector(".shn-main"),
    status: root.querySelector(".shn-status"),
    toggleHelp,
    setStatus(msg, kind = "info") {
      const el = root.querySelector(".shn-status");
      if (!msg) {
        el.hidden = true;
        el.textContent = "";
        return;
      }
      el.hidden = false;
      el.dataset.kind = kind;
      el.textContent = msg;
    },
    setUser(user) {
      const el = root.querySelector(".shn-user");
      if (user) {
        el.textContent = user;
      }
    },
    /**
     * RES-style undo chip while a hide is still cancellable.
     * @param {{ title: string, durationMs: number, onUndo: () => void }} opts
     */
    showUndoToast(opts) {
      undoHandler = opts.onUndo;
      const t = opts.title || "";
      undoTitle.textContent =
        t.length > 48 ? t.slice(0, 46) + "…" : t;
      undoToast.hidden = false;
      // Restart progress bar animation
      undoBar.style.animation = "none";
      // force reflow
      void undoBar.offsetWidth;
      undoBar.style.animation = "";
      undoBar.style.animationDuration = `${opts.durationMs || 4800}ms`;
    },
    hideUndoToast() {
      undoToast.hidden = true;
      undoHandler = null;
      undoTitle.textContent = "";
    },
  };
}
