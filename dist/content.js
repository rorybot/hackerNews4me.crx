// src/api.ts
var API = "https://hacker-news.firebaseio.com/v0";
var itemCache = /* @__PURE__ */ new Map();
var STORY_LISTS = {
  top: "topstories",
  new: "newstories",
  best: "beststories",
  ask: "askstories",
  show: "showstories",
  job: "jobstories"
};
function routeFromLocation(pathname, search) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);
  if (path === "/item") {
    const id = Number(params.get("id"));
    if (Number.isFinite(id) && id > 0) return { kind: "thread", id };
  }
  if (path === "/" || path === "/news" || path === "/front")
    return { kind: "list", list: "top" };
  if (path === "/newest") return { kind: "list", list: "new" };
  if (path === "/best") return { kind: "list", list: "best" };
  if (path === "/ask") return { kind: "list", list: "ask" };
  if (path === "/show") return { kind: "list", list: "show" };
  if (path === "/jobs") return { kind: "list", list: "job" };
  return { kind: "list", list: "top", note: path };
}
async function fetchStoryIds(listKey) {
  const endpoint = STORY_LISTS[listKey] || STORY_LISTS.top;
  const res = await fetch(`${API}/${endpoint}.json`);
  if (!res.ok) throw new Error(`Failed to load ${endpoint}: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((x) => typeof x === "number");
}
async function fetchItem(id, opts = {}) {
  if (!opts.force && itemCache.has(id)) return itemCache.get(id) ?? null;
  const res = await fetch(`${API}/item/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load item ${id}: ${res.status}`);
  const item = await res.json();
  if (item && typeof item.id === "number") itemCache.set(id, item);
  return item;
}
async function fetchItems(ids, concurrency = 12) {
  const results = new Array(ids.length);
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];
      if (id === void 0) continue;
      try {
        results[idx] = await fetchItem(id);
      } catch {
        results[idx] = null;
      }
    }
  }
  const n = Math.min(concurrency, Math.max(ids.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results.filter((x) => Boolean(x));
}
async function fetchStoriesSortedByPoints(opts) {
  const listKey = opts.listKey || "top";
  const windowHours = opts.windowHours ?? 72;
  const poolSize = opts.poolSize ?? 200;
  const limit = opts.limit ?? 30;
  const hidden = new Set(opts.hiddenIds || []);
  const primary = await fetchStoryIds(listKey);
  let poolIds = [...primary];
  if (listKey === "top" || listKey === "best") {
    try {
      const newest = await fetchStoryIds("new");
      poolIds = [...primary.slice(0, Math.ceil(poolSize * 0.65)), ...newest];
    } catch {
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const capped = [];
  for (const id of poolIds) {
    if (hidden.has(id) || seen.has(id)) continue;
    seen.add(id);
    capped.push(id);
    if (capped.length >= poolSize) break;
  }
  const raw = await fetchItems(capped, 16);
  const cutoff = Math.floor(Date.now() / 1e3) - windowHours * 3600;
  const eligible = raw.filter((item) => {
    if (!item || item.deleted || item.dead) return false;
    if (item.type === "comment") return false;
    if (!item.time || item.time < cutoff) return false;
    return true;
  });
  eligible.sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sb !== sa) return sb - sa;
    return (b.time ?? 0) - (a.time ?? 0);
  });
  return {
    items: eligible.slice(0, limit),
    scanned: capped.length,
    matched: eligible.length,
    windowHours
  };
}
async function fetchCommentTree(root, maxDepth = 12) {
  if (!root?.kids?.length || maxDepth <= 0) {
    return { ...root, children: [] };
  }
  const children = await fetchItems(root.kids);
  const withKids = await Promise.all(
    children.filter((c) => c && !c.deleted && !c.dead).map((c) => fetchCommentTree(c, maxDepth - 1))
  );
  return { ...root, children: withKids };
}
function timeAgo(unixSeconds) {
  if (!unixSeconds) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1e3 - unixSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}
function domainOf(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// src/storage.ts
var DEFAULTS = {
  columnWidths: {
    vote: 44,
    rank: 48,
    title: 0,
    points: 72,
    comments: 72,
    age: 64,
    by: 120
  },
  pageSize: 30,
  hiddenIds: [],
  sortByPoints: false,
  sortWindowHours: 72
};
function area() {
  try {
    if (chrome?.storage?.sync) return chrome.storage.sync;
  } catch {
  }
  return chrome.storage.local;
}
function isRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function sanitizeColumnWidths(raw) {
  const d = DEFAULTS.columnWidths;
  if (!isRecord(raw)) return { ...d };
  const num = (k) => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) ? v : d[k];
  };
  return {
    vote: num("vote"),
    rank: num("rank"),
    title: num("title"),
    points: num("points"),
    comments: num("comments"),
    age: num("age"),
    by: num("by")
  };
}
function normalizeSettings(raw) {
  const r = isRecord(raw) ? raw : {};
  const hiddenIds = Array.isArray(r.hiddenIds) ? r.hiddenIds.filter((x) => typeof x === "number" && Number.isFinite(x)).map((x) => Math.trunc(x)).slice(-500) : [];
  const pageSize = typeof r.pageSize === "number" && r.pageSize > 0 && r.pageSize <= 100 ? Math.trunc(r.pageSize) : DEFAULTS.pageSize;
  const sortWindowHours = typeof r.sortWindowHours === "number" && r.sortWindowHours > 0 && r.sortWindowHours <= 24 * 14 ? Math.trunc(r.sortWindowHours) : DEFAULTS.sortWindowHours;
  return {
    columnWidths: sanitizeColumnWidths(r.columnWidths),
    pageSize,
    hiddenIds,
    sortByPoints: Boolean(r.sortByPoints),
    sortWindowHours
  };
}
async function loadSettings() {
  const store = area();
  return new Promise((resolve) => {
    store.get({ ...DEFAULTS }, (data) => {
      resolve(normalizeSettings({ ...DEFAULTS, ...data }));
    });
  });
}
async function saveSettings(partial) {
  const store = area();
  const safe = {};
  if (partial.columnWidths)
    safe.columnWidths = sanitizeColumnWidths(partial.columnWidths);
  if (typeof partial.pageSize === "number") safe.pageSize = partial.pageSize;
  if (Array.isArray(partial.hiddenIds)) safe.hiddenIds = partial.hiddenIds;
  if (typeof partial.sortByPoints === "boolean")
    safe.sortByPoints = partial.sortByPoints;
  if (typeof partial.sortWindowHours === "number")
    safe.sortWindowHours = partial.sortWindowHours;
  return new Promise((resolve) => {
    store.set(safe, () => resolve());
  });
}
async function hideItem(id) {
  const settings = await loadSettings();
  const set = new Set(settings.hiddenIds);
  set.add(Math.trunc(id));
  const hiddenIds = [...set].slice(-500);
  await saveSettings({ hiddenIds });
  return hiddenIds;
}

// src/keyboard.ts
function bindKeyboard(handlers) {
  let chord = null;
  let chordTimer = null;
  function clearChord() {
    chord = null;
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
  }
  function onKey(e) {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
      return;
    }
    if (t && t.tagName === "BUTTON" && e.key === "Enter") return;
    const key = e.key;
    if (chord === "g") {
      clearChord();
      if (key === "h") {
        e.preventDefault();
        handlers.onGo?.("/");
        return;
      }
      if (key === "n") {
        e.preventDefault();
        handlers.onGo?.("/newest");
        return;
      }
      if (key === "a") {
        e.preventDefault();
        handlers.onGo?.("/ask");
        return;
      }
      if (key === "s") {
        e.preventDefault();
        handlers.onGo?.("/show");
        return;
      }
      if (key === "j") {
        e.preventDefault();
        handlers.onGo?.("/jobs");
        return;
      }
    }
    if (key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      chord = "g";
      chordTimer = setTimeout(clearChord, 800);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (key) {
      case "j":
        e.preventDefault();
        handlers.onNext?.();
        break;
      case "k":
        e.preventDefault();
        handlers.onPrev?.();
        break;
      case "Enter":
        e.preventDefault();
        handlers.onComments?.();
        break;
      case "l":
      case "o":
        e.preventDefault();
        handlers.onOpen?.();
        break;
      case "a":
        e.preventDefault();
        handlers.onUpvote?.();
        break;
      case "x":
        e.preventDefault();
        handlers.onHide?.();
        break;
      case "u":
        e.preventDefault();
        handlers.onUndoHide?.();
        break;
      case "r":
        e.preventDefault();
        handlers.onRefresh?.();
        break;
      case "h":
        e.preventDefault();
        handlers.onCollapse?.();
        break;
      case "?":
        e.preventDefault();
        handlers.onHelp?.();
        break;
      default:
        break;
    }
  }
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}

// src/sanitize.ts
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "P",
  "A",
  "I",
  "B",
  "EM",
  "STRONG",
  "PRE",
  "CODE",
  "BR",
  "S",
  "U",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE"
]);
var ALLOWED_ATTRS = {
  A: /* @__PURE__ */ new Set(["href", "title", "rel", "target"])
};
function isSafeHref(href) {
  const t = href.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("javascript:")) return false;
  if (t.startsWith("data:")) return false;
  if (t.startsWith("vbscript:")) return false;
  if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("mailto:") || t.startsWith("/") || t.startsWith("#") || t.startsWith("./") || t.startsWith("../")) {
    return true;
  }
  if (!t.includes(":")) return true;
  return false;
}
function sanitizeHnHtml(html) {
  const frag = document.createDocumentFragment();
  if (!html) return frag;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (source, parent) => {
    source.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent ?? ""));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      const tag = el.tagName.toUpperCase();
      if (!ALLOWED_TAGS.has(tag)) {
        walk(el, parent);
        return;
      }
      const clean = document.createElement(tag.toLowerCase());
      const allow = ALLOWED_ATTRS[tag];
      if (allow) {
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) continue;
          if (!allow.has(attr.name.toUpperCase()) && !allow.has(name)) continue;
          if (name === "href") {
            if (!isSafeHref(attr.value)) continue;
            clean.setAttribute("href", attr.value);
            clean.setAttribute("rel", "noopener noreferrer");
            continue;
          }
          if (name === "target") {
            clean.setAttribute("target", "_blank");
            continue;
          }
          clean.setAttribute(name, attr.value);
        }
      }
      walk(el, clean);
      parent.appendChild(clean);
    });
  };
  walk(tpl.content, frag);
  return frag;
}
function setSanitizedHtml(el, html) {
  el.replaceChildren();
  if (!html) return;
  el.appendChild(sanitizeHnHtml(html));
}
function isSafeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function isSafeHnActionUrl(url) {
  try {
    const u = new URL(url, "https://news.ycombinator.com/");
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.hostname !== "news.ycombinator.com") return false;
    if (!/^\/(vote|hide|fave)/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

// src/actions.ts
function decodeHref(href) {
  return href.replace(/&amp;/g, "&");
}
async function upvote(id) {
  try {
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, reason: "Invalid item id." };
    }
    const html = await fetchHtml(`https://news.ycombinator.com/item?id=${id}`);
    if (looksLoggedOut(html)) {
      return {
        ok: false,
        reason: "Not logged into HN. Log in on news.ycombinator.com, then retry."
      };
    }
    let m = html.match(
      new RegExp(`href="(vote\\?id=${id}&amp;how=up[^"]*)"`, "i")
    );
    if (!m) {
      m = html.match(new RegExp(`href="(vote\\?id=${id}&how=up[^"]*)"`, "i"));
    }
    if (!m?.[1]) {
      return {
        ok: false,
        reason: "No upvote link (already voted, or not available)."
      };
    }
    const url = "https://news.ycombinator.com/" + decodeHref(m[1]);
    if (!isSafeHnActionUrl(url)) {
      return { ok: false, reason: "Blocked unexpected vote URL." };
    }
    const res = await fetch(url, {
      credentials: "include",
      redirect: "follow"
    });
    return {
      ok: res.ok || res.type === "opaqueredirect" || res.status === 0 || res.redirected
    };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}
async function hideOnHn(id) {
  try {
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, reason: "Invalid item id." };
    }
    const html = await fetchHtml(`https://news.ycombinator.com/item?id=${id}`);
    if (looksLoggedOut(html)) {
      return { ok: false, reason: "Not logged into HN." };
    }
    const m = html.match(new RegExp(`href="(hide\\?id=${id}[^"]*)"`, "i"));
    if (!m?.[1]) {
      return { ok: false, reason: "No hide link found." };
    }
    const url = "https://news.ycombinator.com/" + decodeHref(m[1]);
    if (!isSafeHnActionUrl(url)) {
      return { ok: false, reason: "Blocked unexpected hide URL." };
    }
    const res = await fetch(url, {
      credentials: "include",
      redirect: "follow"
    });
    return { ok: res.ok || res.redirected || res.status === 0 };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}
async function fetchHtml(url) {
  const u = new URL(url);
  if (u.hostname !== "news.ycombinator.com") {
    throw new Error("Refusing fetch to non-HN host");
  }
  const res = await fetch(url, { credentials: "include" });
  return res.text();
}
function looksLoggedOut(html) {
  if (/logout\?auth=/i.test(html)) return false;
  if (/class="hnuser"/i.test(html)) return false;
  return /href="login\?goto=/i.test(html);
}
async function checkLogin() {
  try {
    const html = await fetchHtml("https://news.ycombinator.com/");
    const user = html.match(/class="hnuser"[^>]*>([^<]+)</i);
    const loggedIn = /logout\?auth=/i.test(html) || Boolean(user);
    return { loggedIn, user: user?.[1] ?? null };
  } catch {
    return { loggedIn: false, user: null };
  }
}
function openBackgroundTab(url) {
  if (!url || !isSafeHttpUrl(url)) return;
  chrome.runtime.sendMessage({ type: "openBackgroundTab", url });
}

// src/fixtures/england.ts
var ENGLAND_FIXTURES = [
  {
    home: "Norway",
    away: "England",
    homeCode: "NOR",
    awayCode: "ENG",
    kickoffUtc: "2026-07-11T21:00:00.000Z",
    stage: "Quarter-final",
    venue: "Miami"
  }
  // Add the next game here when known (e.g. semi-final), then final, etc.
  // Example (uncomment / replace with real schedule):
  // {
  //   home: "TBD",
  //   away: "England",
  //   homeCode: "TBD",
  //   awayCode: "ENG",
  //   kickoffUtc: "2026-07-15T19:00:00.000Z",
  //   stage: "Semi-final",
  //   venue: "TBD",
  // },
];
function getNextEnglandFixture(now = /* @__PURE__ */ new Date()) {
  const graceMs = 3 * 60 * 60 * 1e3;
  const upcoming = ENGLAND_FIXTURES.filter((f) => {
    const t = Date.parse(f.kickoffUtc);
    return Number.isFinite(t) && t + graceMs > now.getTime();
  });
  upcoming.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
  return upcoming[0] || null;
}
function formatFixtureBillboard(f) {
  const d = new Date(f.kickoffUtc);
  const tz = "Europe/London";
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: tz }).toUpperCase();
  const dayMonth = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: tz
  }).toUpperCase();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz
  });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "short"
  }).formatToParts(d);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "UK";
  let stageShort = f.stage.toUpperCase();
  if (/quarter/i.test(f.stage)) stageShort = "QF";
  else if (/semi/i.test(f.stage)) stageShort = "SF";
  else if (/final/i.test(f.stage) && !/semi|quarter/i.test(f.stage))
    stageShort = "FINAL";
  return {
    label: "NEXT UP",
    homeCode: f.homeCode,
    awayCode: f.awayCode,
    homeName: f.home.toUpperCase(),
    awayName: f.away.toUpperCase(),
    match: `${f.homeCode} v ${f.awayCode}`,
    date: `${weekday} ${dayMonth}`,
    time: `${time} ${tzName}`,
    stage: stageShort,
    stageFull: f.stage.toUpperCase(),
    venue: f.venue.toUpperCase(),
    fullTitle: `${f.home} v ${f.away} \xB7 ${f.stage} \xB7 ${f.venue}`
  };
}
var COMMISERATION_MESSAGES = [
  {
    title: "THREE LIONS",
    main: "OUT",
    sub: "PROUD OF THE BOYS",
    footer: "THANKS FOR THE RUN \u2022 2026"
  },
  {
    title: "ENGLAND",
    main: "ELIMINATED",
    sub: "IT'S BEEN A HELL OF A TOURNAMENT",
    footer: "WE'LL BE BACK \u2022 2030"
  },
  {
    title: "THREE LIONS",
    main: "OUT",
    sub: "THEY GAVE IT EVERYTHING",
    footer: "RESPECT \u2022 SEE YOU NEXT TIME"
  }
];
function getEnglandDisplayState(now = /* @__PURE__ */ new Date()) {
  const fixture = getNextEnglandFixture(now);
  if (fixture) {
    return { kind: "fixture", bb: formatFixtureBillboard(fixture) };
  }
  const day = now.getUTCDate();
  const idx = day % COMMISERATION_MESSAGES.length;
  const msg = COMMISERATION_MESSAGES[idx];
  return {
    kind: "eliminated",
    title: msg.title,
    main: msg.main,
    sub: msg.sub,
    footer: msg.footer
  };
}

// src/ui/banner.ts
function createBanner() {
  const bannerUrl = chrome.runtime.getURL("assets/hn-eng-banner.svg");
  const wrap = document.createElement("div");
  wrap.className = "shn-banner";
  wrap.setAttribute("role", "img");
  const state2 = getEnglandDisplayState();
  if (state2.kind === "fixture") {
    const bb = state2.bb;
    wrap.setAttribute(
      "aria-label",
      `Hacker News stadium banner. ${bb.fullTitle || bb.match}`
    );
    wrap.innerHTML = `
      <div class="shn-banner-scene">
        <img
          class="shn-banner-img"
          src="${bannerUrl}"
          alt=""
          width="960"
          height="144"
          draggable="false"
        />
        <div class="shn-billboard" aria-live="polite">
          <div class="shn-billboard-screen">
            <div class="shn-bb-header">
              <span class="shn-bb-hn">HACKER&nbsp;NEWS</span>
              <span class="shn-bb-pulse" aria-hidden="true"></span>
              <span class="shn-bb-label">${escapeHtml(bb.label)}</span>
              <span class="shn-bb-comp">FIFA&nbsp;WC&nbsp;26</span>
            </div>

            <div class="shn-bb-fixture">
              <div class="shn-bb-team shn-bb-home">
                <span class="shn-bb-code">${escapeHtml(bb.homeCode)}</span>
                <span class="shn-bb-name">${escapeHtml(bb.homeName)}</span>
              </div>
              <div class="shn-bb-vs-block">
                <span class="shn-bb-vs">VS</span>
              </div>
              <div class="shn-bb-team shn-bb-away">
                <span class="shn-bb-code">${escapeHtml(bb.awayCode)}</span>
                <span class="shn-bb-name">${escapeHtml(bb.awayName)}</span>
              </div>
            </div>

            <div class="shn-bb-footer">
              <span class="shn-bb-when">
                <span class="shn-bb-date">${escapeHtml(bb.date)}</span>
                <span class="shn-bb-clock">${escapeHtml(bb.time)}</span>
              </span>
              <span class="shn-bb-where">
                <span class="shn-bb-stage">${escapeHtml(bb.stage)}</span>
                <span class="shn-bb-venue">${escapeHtml(bb.venue)}</span>
              </span>
            </div>

            <div class="shn-bb-ticker" aria-hidden="true">
              <span class="shn-bb-ticker-text">\u25A0 KICK-OFF \u25A0 ${escapeHtml(
      bb.date
    )} \u25A0 ${escapeHtml(bb.time)} \u25A0 ${escapeHtml(
      bb.stageFull || bb.stage
    )} \u25A0 ${escapeHtml(bb.venue)} \u25A0 IT'S COMING HOME \u25A0</span>
            </div>

            <div class="shn-bb-scan" aria-hidden="true"></div>
            <div class="shn-bb-grid" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    `;
  } else {
    const { title, main, sub, footer } = state2;
    wrap.setAttribute(
      "aria-label",
      `Hacker News stadium banner. England ${main.toLowerCase()} \u2014 ${sub}`
    );
    wrap.innerHTML = `
      <div class="shn-banner-scene">
        <img
          class="shn-banner-img"
          src="${bannerUrl}"
          alt=""
          width="960"
          height="144"
          draggable="false"
        />
        <div class="shn-billboard" aria-live="polite">
          <div class="shn-billboard-screen shn-bb-eliminated">
            <div class="shn-bb-header">
              <span class="shn-bb-hn">HACKER&nbsp;NEWS</span>
              <span class="shn-bb-pulse" aria-hidden="true"></span>
              <span class="shn-bb-label">${escapeHtml(title)}</span>
              <span class="shn-bb-comp">FIFA&nbsp;WC&nbsp;26</span>
            </div>

            <div class="shn-bb-out">
              <div class="shn-bb-out-main">${escapeHtml(main)}</div>
              <div class="shn-bb-out-sub">${escapeHtml(sub)}</div>
            </div>

            <div class="shn-bb-footer">
              <span class="shn-bb-when">
                <span class="shn-bb-date">TOURNAMENT</span>
                <span class="shn-bb-clock">OVER</span>
              </span>
              <span class="shn-bb-where">
                <span class="shn-bb-stage">OUT</span>
                <span class="shn-bb-venue">${escapeHtml(footer)}</span>
              </span>
            </div>

            <div class="shn-bb-ticker" aria-hidden="true">
              <span class="shn-bb-ticker-text">\u25A0 ENGLAND OUT \u25A0 PROUD OF THE LADS \u25A0 THANKS FOR EVERYTHING \u25A0 IT'S COMING HOME ONE DAY \u25A0</span>
            </div>

            <div class="shn-bb-scan" aria-hidden="true"></div>
            <div class="shn-bb-grid" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    `;
  }
  return wrap;
}
function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/ui/shell.ts
var NAV = [
  { href: "/", label: "Top", list: "top" },
  { href: "/newest", label: "New", list: "new" },
  { href: "/best", label: "Best", list: "best" },
  { href: "/ask", label: "Ask", list: "ask" },
  { href: "/show", label: "Show", list: "show" },
  { href: "/jobs", label: "Jobs", list: "job" }
];
function renderShell(opts = {}) {
  const root = document.createElement("div");
  root.id = "sandy-hn";
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
          <span class="shn-title">hackerNews4me.crx</span>
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
        <button type="button" class="shn-undo-toast-btn" title="Undo hide (u)">undo \xB7 u</button>
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
          <dt>a</dt><dd>Upvote (or click \u25B2)</dd>
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
          (approx. last 72h sample) \u2014 click again for feed order.
        </p>
        <button type="button" class="shn-help-close">Close</button>
      </div>
    </div>
  `;
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
    showUndoToast(opts2) {
      undoHandler = opts2.onUndo;
      const t = opts2.title || "";
      undoTitle.textContent = t.length > 48 ? t.slice(0, 46) + "\u2026" : t;
      undoToast.hidden = false;
      undoBar.style.animation = "none";
      void undoBar.offsetWidth;
      undoBar.style.animation = "";
      undoBar.style.animationDuration = `${opts2.durationMs || 4800}ms`;
    },
    hideUndoToast() {
      undoToast.hidden = true;
      undoHandler = null;
      undoTitle.textContent = "";
    }
  };
}

// src/ui/list.ts
var COLS = [
  { key: "vote", label: "^", min: 36, max: 56, default: 44 },
  { key: "rank", label: "#", min: 36, max: 80, default: 48 },
  { key: "title", label: "TITLE", min: 160, max: 900, default: 0 },
  // 0 = flex grow
  { key: "points", label: "PTS", min: 48, max: 120, default: 72 },
  { key: "comments", label: "CMT", min: 48, max: 120, default: 72 },
  { key: "age", label: "AGE", min: 48, max: 120, default: 64 },
  { key: "by", label: "BY", min: 72, max: 220, default: 120 }
];
function renderList(container, opts) {
  const {
    items,
    offset,
    columnWidths,
    selectedIndex,
    onSelect,
    onResize,
    sortByPoints = false,
    sortWindowHours = 72
  } = opts;
  container.innerHTML = "";
  const shell2 = document.createElement("div");
  shell2.className = "shn-table-shell shn-glass";
  const titlebar = document.createElement("div");
  titlebar.className = "shn-tui-titlebar";
  const sortHint = sortByPoints ? `sort: pts\u2193 \xB7 ${sortWindowHours}h` : "sort: feed order";
  titlebar.innerHTML = `
    <span class="shn-tui-deco" aria-hidden="true">\u250C</span>
    <span class="shn-tui-label">stories</span>
    <span class="shn-tui-deco" aria-hidden="true">\u2500</span>
    <button type="button" class="shn-tui-sort-btn" title="Toggle sort by points (last ${sortWindowHours}h)">${sortHint}</button>
    <span class="shn-tui-deco" aria-hidden="true">\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</span>
    <span class="shn-tui-hint">j/k \xB7 enter \xB7 l \xB7 a \xB7 x hide \xB7 u undo</span>
    <span class="shn-tui-deco" aria-hidden="true">\u2510</span>
  `;
  titlebar.querySelector(".shn-tui-sort-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    opts.onToggleSortByPoints?.();
  });
  shell2.appendChild(titlebar);
  const wrap = document.createElement("div");
  wrap.className = "shn-table-wrap";
  const table = document.createElement("div");
  table.className = "shn-table";
  table.setAttribute("role", "table");
  const header = document.createElement("div");
  header.className = "shn-row shn-head";
  header.setAttribute("role", "row");
  COLS.forEach((col, colIndex) => {
    const cell = document.createElement("div");
    cell.className = `shn-cell shn-col-${col.key}`;
    cell.setAttribute("role", "columnheader");
    const label = document.createElement("span");
    label.className = "shn-col-label";
    if (col.key === "points") {
      label.textContent = sortByPoints ? "PTS\u2193" : "PTS";
      label.classList.add("shn-sort-label");
      if (sortByPoints) label.classList.add("is-active");
      label.title = sortByPoints ? `Sorted by points (last ${sortWindowHours}h). Click to restore feed order.` : `Sort by points among stories from the last ${sortWindowHours}h (approx).`;
      cell.classList.add("shn-col-sortable");
      cell.tabIndex = 0;
      cell.setAttribute("role", "columnheader");
      cell.setAttribute("aria-sort", sortByPoints ? "descending" : "none");
      const activate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.onToggleSortByPoints?.();
      };
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".shn-resize-bar")) return;
        activate(e);
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") activate(e);
      });
    } else {
      label.textContent = col.label;
    }
    if (col.key === "vote") {
      label.classList.add("shn-vote-head");
      label.title = "Upvote";
    }
    cell.appendChild(label);
    applyWidth(cell, col, columnWidths);
    if (colIndex < COLS.length - 1) {
      cell.appendChild(makeResizeBar(col, columnWidths, onResize, table));
    }
    header.appendChild(cell);
  });
  table.appendChild(header);
  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "shn-row shn-item";
    row.setAttribute("role", "row");
    row.dataset.index = String(index);
    row.dataset.id = String(item.id);
    if (index === selectedIndex) row.classList.add("is-selected");
    if (item._pendingHide) {
      row.classList.add("is-pending-hide");
      row.title = "Hiding\u2026 press u to undo";
    }
    const vote = document.createElement("div");
    vote.className = "shn-cell shn-col-vote";
    applyWidth(vote, COLS[0], columnWidths);
    const voteBtn = document.createElement("button");
    voteBtn.type = "button";
    voteBtn.className = "shn-vote-btn";
    voteBtn.title = "Upvote (a)";
    voteBtn.setAttribute("aria-label", `Upvote ${item.title || "story"}`);
    voteBtn.innerHTML = `<span class="shn-vote-arrow" aria-hidden="true">^</span>`;
    if (item._upvoted) voteBtn.classList.add("is-voted");
    voteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(index);
      opts.onUpvote?.(item, voteBtn);
    });
    vote.appendChild(voteBtn);
    const rank = document.createElement("div");
    rank.className = "shn-cell shn-col-rank";
    rank.textContent = String(offset + index);
    applyWidth(rank, COLS[1], columnWidths);
    const title = document.createElement("div");
    title.className = "shn-cell shn-col-title";
    applyWidth(title, COLS[2], columnWidths);
    const link = document.createElement("a");
    link.className = "shn-story-link";
    const href = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
    link.href = href;
    link.textContent = item.title || "(untitled)";
    link.title = "Open story (l)";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      onSelect(index);
      openBackgroundTab(href);
      opts.onOpen?.(item);
    });
    title.appendChild(link);
    const domain = domainOf(item.url);
    if (domain) {
      const d = document.createElement("span");
      d.className = "shn-domain";
      d.textContent = domain;
      title.appendChild(d);
    }
    const points = document.createElement("div");
    points.className = "shn-cell shn-col-points";
    points.dataset.role = "points";
    points.textContent = item.score != null ? String(item.score) : "\u2013";
    applyWidth(points, COLS[3], columnWidths);
    const comments = document.createElement("div");
    comments.className = "shn-cell shn-col-comments";
    applyWidth(comments, COLS[4], columnWidths);
    const cLink = document.createElement("a");
    cLink.href = `https://news.ycombinator.com/item?id=${item.id}`;
    cLink.textContent = item.descendants != null ? String(item.descendants) : "0";
    cLink.title = "Open comments (Enter)";
    cLink.addEventListener("click", (e) => {
      e.preventDefault();
      onSelect(index);
      opts.onComments?.(item);
    });
    comments.appendChild(cLink);
    const age = document.createElement("div");
    age.className = "shn-cell shn-col-age";
    age.textContent = timeAgo(item.time);
    age.title = item.time ? new Date(item.time * 1e3).toLocaleString() : "";
    applyWidth(age, COLS[5], columnWidths);
    const by = document.createElement("div");
    by.className = "shn-cell shn-col-by";
    by.textContent = item.by || "";
    applyWidth(by, COLS[6], columnWidths);
    [vote, rank, title, points, comments, age].forEach((cell) => {
      const rail = document.createElement("span");
      rail.className = "shn-col-rail";
      rail.setAttribute("aria-hidden", "true");
      cell.appendChild(rail);
    });
    row.append(vote, rank, title, points, comments, age, by);
    row.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      onSelect(index);
    });
    row.addEventListener("dblclick", (e) => {
      if (e.target.closest("a, button")) return;
      onSelect(index);
      opts.onComments?.(item);
    });
    table.appendChild(row);
  });
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "shn-empty";
    empty.textContent = "No stories to show.";
    table.appendChild(empty);
  }
  wrap.appendChild(table);
  shell2.appendChild(wrap);
  container.appendChild(shell2);
  const sel = table.querySelector(".shn-row.is-selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}
function makeResizeBar(col, columnWidths, onResize, table) {
  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "shn-resize-bar";
  bar.title = `Drag to resize \u201C${col.label}\u201D`;
  bar.setAttribute("aria-label", `Resize ${col.label} column`);
  bar.innerHTML = `<span class="shn-resize-grip" aria-hidden="true"></span>`;
  bar.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startResize(col, e.clientX, columnWidths, onResize, table, bar);
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 8 : -8;
    const startW = effectiveWidth(col, columnWidths);
    const next = clampWidth(col, startW + delta);
    const updated = { ...columnWidths, [col.key]: next };
    applyWidthToColumn(table, col, next);
    onResize(updated, true);
  });
  return bar;
}
function effectiveWidth(col, widths) {
  const w = widths?.[col.key];
  if (col.key === "title" && (!w || w === 0)) return 420;
  return w || col.default || 72;
}
function clampWidth(col, n) {
  return Math.max(col.min, Math.min(col.max, n));
}
function applyWidth(el, col, widths) {
  const w = widths?.[col.key];
  if (col.key === "title" && (!w || w === 0)) {
    el.style.flex = "1 1 auto";
    el.style.width = "auto";
    el.style.minWidth = `${col.min}px`;
    el.style.maxWidth = "none";
  } else {
    const px = w || col.default || 72;
    el.style.flex = `0 0 ${px}px`;
    el.style.width = `${px}px`;
    el.style.minWidth = `${col.min}px`;
  }
}
function applyWidthToColumn(table, col, px) {
  table.querySelectorAll(`.shn-col-${col.key}`).forEach((cell) => {
    cell.style.flex = `0 0 ${px}px`;
    cell.style.width = `${px}px`;
    if (col.key === "title") cell.style.minWidth = `${col.min}px`;
  });
}
function startResize(col, startX, widths, onResize, table, bar) {
  let startW = widths?.[col.key];
  if (col.key === "title" && (!startW || startW === 0)) {
    const sample = table.querySelector(`.shn-col-title`);
    startW = sample ? sample.getBoundingClientRect().width : 420;
  } else {
    startW = startW || col.default || 72;
  }
  document.body.classList.add("shn-resizing");
  bar.classList.add("is-active");
  const onMove = (e) => {
    const next = clampWidth(col, startW + (e.clientX - startX));
    applyWidthToColumn(table, col, next);
    onResize({ ...widths, [col.key]: next }, false);
  };
  const onUp = (e) => {
    const next = clampWidth(col, startW + (e.clientX - startX));
    onResize({ ...widths, [col.key]: next }, true);
    document.body.classList.remove("shn-resizing");
    bar.classList.remove("is-active");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
function setSelectedRow(container, index) {
  container.querySelectorAll(".shn-row.shn-item").forEach((row) => {
    row.classList.toggle("is-selected", Number(row.dataset.index) === index);
  });
  const sel = container.querySelector(".shn-row.is-selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

// src/ui/thread.ts
function flatten(node, depth, acc) {
  if (!node) return acc;
  acc.push({ item: node, depth });
  if (!node._collapsed && node.children?.length) {
    for (const child of node.children) flatten(child, depth + 1, acc);
  }
  return acc;
}
function renderThread(container, opts) {
  const { story, tree, selectedIndex, onSelect, onToggleCollapse, onUpvote } = opts;
  container.innerHTML = "";
  const page = document.createElement("div");
  page.className = "shn-thread";
  const titlebar = document.createElement("div");
  titlebar.className = "shn-tui-titlebar shn-glass";
  titlebar.style.marginBottom = "0.5rem";
  titlebar.innerHTML = `
    <span class="shn-tui-deco" aria-hidden="true">\u250C</span>
    <span class="shn-tui-label">thread</span>
    <span class="shn-tui-deco" aria-hidden="true">\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</span>
    <span class="shn-tui-hint">j/k \xB7 h collapse \xB7 a vote \xB7 l open link</span>
    <span class="shn-tui-deco" aria-hidden="true">\u2510</span>
  `;
  page.appendChild(titlebar);
  const header = document.createElement("article");
  header.className = "shn-story-header shn-glass";
  header.dataset.index = "0";
  if (selectedIndex === 0) header.classList.add("is-selected");
  const inner = document.createElement("div");
  inner.className = "shn-story-inner";
  const title = document.createElement("h1");
  const tLink = document.createElement("a");
  const href = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
  tLink.href = href;
  tLink.textContent = story.title || "(untitled)";
  tLink.addEventListener("click", (e) => {
    e.preventDefault();
    openBackgroundTab(href);
  });
  title.appendChild(tLink);
  const domain = domainOf(story.url);
  if (domain) {
    const d = document.createElement("span");
    d.className = "shn-domain";
    d.textContent = domain;
    title.appendChild(document.createTextNode(" "));
    title.appendChild(d);
  }
  const meta = document.createElement("div");
  meta.className = "shn-story-meta";
  const voteBtn = makeVoteButton(story, (btn) => {
    onSelect(0);
    onUpvote?.(story, btn);
  });
  const metaText = document.createElement("span");
  metaText.className = "shn-story-meta-text";
  metaText.textContent = [
    story.score != null ? `${story.score} points` : null,
    story.by ? `by ${story.by}` : null,
    timeAgo(story.time) ? `${timeAgo(story.time)} ago` : null,
    story.descendants != null ? `${story.descendants} comments` : null
  ].filter(Boolean).join(" \xB7 ");
  meta.append(voteBtn, metaText);
  inner.append(title, meta);
  if (story.text) {
    const body = document.createElement("div");
    body.className = "shn-text";
    setSanitizedHtml(body, story.text);
    inner.appendChild(body);
  }
  header.appendChild(inner);
  header.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    onSelect(0);
  });
  page.appendChild(header);
  const list = document.createElement("div");
  list.className = "shn-comments";
  const flat = [];
  if (tree?.children?.length) {
    for (const child of tree.children) flatten(child, 0, flat);
  }
  flat.forEach((entry, i) => {
    const index = i + 1;
    const { item, depth } = entry;
    const el = document.createElement("div");
    el.className = "shn-comment shn-glass";
    el.dataset.index = String(index);
    el.dataset.id = String(item.id);
    el.style.setProperty("--depth", String(depth));
    if (index === selectedIndex) el.classList.add("is-selected");
    if (item._collapsed) el.classList.add("is-collapsed");
    const bar = document.createElement("div");
    bar.className = "shn-comment-meta";
    const voteBtn2 = makeVoteButton(item, (btn) => {
      onSelect(index);
      onUpvote?.(item, btn);
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "shn-collapse-btn";
    toggle.textContent = item._collapsed ? `[+] (${countDesc(item)})` : "[\u2013]";
    toggle.title = "Collapse / expand (h)";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleCollapse(item.id);
    });
    const by = document.createElement("span");
    by.className = "shn-comment-by";
    by.textContent = item.by || "unknown";
    const age = document.createElement("span");
    age.className = "shn-comment-age";
    age.textContent = timeAgo(item.time);
    bar.append(voteBtn2, toggle, by, age);
    const text = document.createElement("div");
    text.className = "shn-text";
    if (item._collapsed) {
      text.hidden = true;
    } else {
      if (item.text) {
        setSanitizedHtml(text, item.text);
      } else {
        text.textContent = "deleted";
      }
    }
    const body = document.createElement("div");
    body.className = "shn-comment-inner";
    body.append(bar, text);
    el.appendChild(body);
    el.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      onSelect(index);
    });
    el.addEventListener(
      "click",
      (e) => {
        const a = e.target.closest("a");
        if (a && a.href && text.contains(a)) {
          e.preventDefault();
          openBackgroundTab(a.href);
        }
      },
      true
    );
    list.appendChild(el);
  });
  if (!flat.length) {
    const empty = document.createElement("div");
    empty.className = "shn-empty";
    empty.textContent = "No comments yet.";
    list.appendChild(empty);
  }
  page.appendChild(list);
  container.appendChild(page);
  const sel = container.querySelector(".is-selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
  return { flatLength: flat.length + 1, flat };
}
function countDesc(item) {
  let n = 0;
  function walk(node) {
    if (!node?.children) return;
    for (const c of node.children) {
      n++;
      walk(c);
    }
  }
  walk(item);
  return n;
}
function makeVoteButton(item, onClick) {
  const voteBtn = document.createElement("button");
  voteBtn.type = "button";
  voteBtn.className = "shn-vote-btn";
  voteBtn.title = "Upvote (a)";
  voteBtn.setAttribute("aria-label", "Upvote");
  voteBtn.innerHTML = `<span class="shn-vote-arrow" aria-hidden="true">^</span>`;
  if (item._upvoted) voteBtn.classList.add("is-voted");
  voteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(voteBtn);
  });
  return voteBtn;
}
function toggleCollapsed(tree, id) {
  function walk(node) {
    if (!node) return false;
    if (node.id === id) {
      node._collapsed = !node._collapsed;
      return true;
    }
    if (node.children) {
      for (const c of node.children) {
        if (walk(c)) return true;
      }
    }
    return false;
  }
  walk(tree);
  return tree;
}
function getFlatEntry(tree, selectedIndex) {
  if (selectedIndex === 0) return { kind: "story", item: tree };
  const flat = [];
  if (tree?.children) {
    for (const c of tree.children) flatten(c, 0, flat);
  }
  const entry = flat[selectedIndex - 1];
  return entry ? { kind: "comment", item: entry.item, depth: entry.depth } : null;
}

// src/app.ts
var PAGE_SIZE = 30;
var HIDE_UNDO_MS = 4800;
var shell = null;
var state = {
  route: null,
  settings: null,
  items: [],
  selectedIndex: 0,
  tree: null,
  story: null,
  login: { loggedIn: false, user: null },
  page: 0
};
var pendingHides = /* @__PURE__ */ new Map();
async function init() {
  document.documentElement.classList.add("shn-active");
  try {
    document.documentElement.style.background = "#1a1410";
  } catch {
  }
  state.settings = await loadSettings();
  state.login = await checkLogin();
  state.route = routeFromLocation(location.pathname, location.search);
  shell = renderShell({
    activeList: state.route.kind === "list" ? state.route.list : null,
    user: state.login.user,
    onNav: (href) => navigate(href)
  });
  document.body.textContent = "";
  document.body.appendChild(shell.root);
  bindKeyboard({
    onNext: () => moveSelection(1),
    onPrev: () => moveSelection(-1),
    onOpen: () => openSelected(),
    onComments: () => openCommentsSelected(),
    onUpvote: () => upvoteSelected(),
    onHide: () => hideSelected(),
    onUndoHide: () => undoHide(),
    onRefresh: () => reload(),
    onCollapse: () => collapseSelected(),
    onHelp: () => shell?.toggleHelp(),
    onGo: (path) => navigate(path)
  });
  window.addEventListener("popstate", () => {
    state.route = routeFromLocation(location.pathname, location.search);
    reload();
  });
  await reload();
}
function navigate(path) {
  cancelAllPendingHides();
  const url = path.startsWith("http") ? path : `https://news.ycombinator.com${path}`;
  history.pushState({}, "", url);
  state.route = routeFromLocation(location.pathname, location.search);
  state.selectedIndex = 0;
  state.page = 0;
  document.body.textContent = "";
  shell = renderShell({
    activeList: state.route.kind === "list" ? state.route.list : null,
    user: state.login.user,
    onNav: (href) => navigate(href)
  });
  document.body.appendChild(shell.root);
  reload();
}
async function reload() {
  if (!shell) return;
  cancelAllPendingHides();
  shell.main.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "shn-loading";
  loading.textContent = "Loading\u2026";
  shell.main.appendChild(loading);
  shell.setStatus("");
  try {
    if (state.route.kind === "thread") {
      await loadThread(state.route.id);
    } else {
      await loadList(state.route.list);
    }
  } catch (e) {
    shell.main.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "shn-empty";
    empty.textContent = `Failed to load. ${String(e.message || e)}`;
    shell.main.appendChild(empty);
    shell.setStatus(String(e.message || e), "error");
  }
}
async function loadList(listKey) {
  const hidden = state.settings.hiddenIds || [];
  const pageSize = state.settings.pageSize || PAGE_SIZE;
  const sortByPoints = Boolean(state.settings.sortByPoints);
  const windowHours = state.settings.sortWindowHours || 72;
  if (sortByPoints) {
    shell.setStatus(`Sorting by pts \xB7 last ${windowHours}h (sampling feed)\u2026`);
    const result = await fetchStoriesSortedByPoints({
      listKey,
      windowHours,
      poolSize: 200,
      hiddenIds: hidden,
      limit: pageSize
    });
    state.items = result.items;
    state.selectedIndex = Math.min(
      state.selectedIndex,
      Math.max(0, state.items.length - 1)
    );
    shell.setStatus(
      `pts\u2193 \xB7 last ${result.windowHours}h \xB7 ${result.items.length} shown \xB7 scanned ${result.scanned}`,
      "ok"
    );
    paintList();
    return;
  }
  const ids = await fetchStoryIds(listKey);
  const hiddenSet = new Set(hidden);
  const visible = ids.filter((id) => !hiddenSet.has(id));
  const start = state.page * pageSize;
  const slice = visible.slice(start, start + pageSize);
  const items = await fetchItems(slice);
  state.items = items;
  if (state.selectedIndex >= items.length) {
    state.selectedIndex = Math.max(0, items.length - 1);
  }
  paintList();
}
function paintList() {
  const sortByPoints = Boolean(state.settings.sortByPoints);
  const windowHours = state.settings.sortWindowHours || 72;
  renderList(shell.main, {
    items: state.items,
    offset: state.page * (state.settings.pageSize || PAGE_SIZE) + 1,
    columnWidths: state.settings.columnWidths,
    selectedIndex: state.selectedIndex,
    sortByPoints,
    sortWindowHours: windowHours,
    onSelect: (i) => {
      state.selectedIndex = i;
      setSelectedRow(shell.main, i);
    },
    onResize: async (widths, persist) => {
      state.settings.columnWidths = widths;
      if (persist) await saveSettings({ columnWidths: widths });
    },
    onComments: (item) => {
      navigate(`/item?id=${item.id}`);
    },
    onUpvote: (item, btn) => {
      const idx = state.items.findIndex((x) => x.id === item.id);
      if (idx >= 0) state.selectedIndex = idx;
      upvoteItem(item, btn);
    },
    onToggleSortByPoints: () => toggleSortByPoints()
  });
}
async function toggleSortByPoints() {
  if (state.route?.kind !== "list") return;
  const next = !state.settings.sortByPoints;
  state.settings.sortByPoints = next;
  state.selectedIndex = 0;
  state.page = 0;
  await saveSettings({ sortByPoints: next });
  await reload();
}
async function loadThread(id) {
  shell.setStatus("Loading comments\u2026");
  const story = await fetchItem(id, { force: true });
  if (!story) throw new Error("Story not found");
  state.story = story;
  const tree = await fetchCommentTree(story);
  state.tree = tree;
  state.selectedIndex = 0;
  shell.setStatus("");
  paintThread();
}
function paintThread() {
  renderThread(shell.main, {
    story: state.story,
    tree: state.tree,
    selectedIndex: state.selectedIndex,
    onSelect: (i) => {
      state.selectedIndex = i;
      paintThread();
    },
    onToggleCollapse: (id) => {
      toggleCollapsed(state.tree, id);
      paintThread();
    },
    onUpvote: (item, btn) => {
      upvoteItem(item, btn);
    }
  });
}
function moveSelection(delta) {
  if (state.route.kind === "list") {
    const max2 = state.items.length;
    if (!max2) return;
    state.selectedIndex = clamp(state.selectedIndex + delta, 0, max2 - 1);
    setSelectedRow(shell.main, state.selectedIndex);
    return;
  }
  const nodes = shell.main.querySelectorAll("[data-index]");
  const max = nodes.length;
  if (!max) return;
  state.selectedIndex = clamp(state.selectedIndex + delta, 0, max - 1);
  nodes.forEach((n) => {
    n.classList.toggle("is-selected", Number(n.dataset.index) === state.selectedIndex);
  });
  const sel = shell.main.querySelector(".is-selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}
function openSelected() {
  if (state.route.kind === "list") {
    const item = state.items[state.selectedIndex];
    if (!item) return;
    const url = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
    openBackgroundTab(url);
    return;
  }
  if (state.story) {
    const url = state.story.url || `https://news.ycombinator.com/item?id=${state.story.id}`;
    openBackgroundTab(url);
  }
}
function openCommentsSelected() {
  if (state.route.kind === "list") {
    const item = state.items[state.selectedIndex];
    if (!item) return;
    navigate(`/item?id=${item.id}`);
    return;
  }
  const first = shell.main.querySelector('.shn-comment[data-index="1"]');
  if (first) {
    state.selectedIndex = 1;
    paintThread();
  }
}
async function upvoteSelected() {
  let item = null;
  if (state.route.kind === "list") {
    item = state.items[state.selectedIndex];
  } else if (state.selectedIndex === 0) {
    item = state.story;
  } else {
    item = getFlatEntry(state.tree, state.selectedIndex)?.item;
  }
  if (!item) return;
  const btn = shell.main.querySelector(".is-selected .shn-vote-btn") || shell.main.querySelector(`[data-id="${item.id}"] .shn-vote-btn`);
  await upvoteItem(item, btn);
}
async function upvoteItem(item, btn) {
  if (!item?.id) return;
  if (item._upvoted) {
    shell.setStatus("Already upvoted.", "info");
    return;
  }
  btn?.classList.add("is-pending");
  shell.setStatus("Upvoting\u2026");
  const result = await upvote(item.id);
  btn?.classList.remove("is-pending");
  if (result.ok) {
    item._upvoted = true;
    if (typeof item.score === "number") item.score += 1;
    btn?.classList.add("is-voted");
    shell.setStatus("Upvoted.", "ok");
    const row = shell.main.querySelector(`[data-id="${item.id}"]`);
    const pts = row?.querySelector('[data-role="points"]');
    if (pts && item.score != null) pts.textContent = String(item.score);
    const sel = shell.main.querySelector(".is-selected");
    sel?.classList.add("shn-flash-ok");
  } else {
    shell.setStatus(result.reason || "Upvote failed", "error");
  }
}
function hideSelected() {
  if (state.route.kind !== "list") {
    shell.setStatus("Hide works on list pages (local + HN).", "error");
    return;
  }
  const fromIndex = state.selectedIndex;
  const item = state.items[fromIndex];
  if (!item) return;
  if (item._pendingHide || pendingHides.has(item.id)) {
    shell.setStatus("Already hiding \u2014 press u to undo.", "info");
    return;
  }
  item._pendingHide = true;
  const title = item.title || `item ${item.id}`;
  if (fromIndex < state.items.length - 1) {
    state.selectedIndex = fromIndex + 1;
  } else {
    state.selectedIndex = Math.max(0, fromIndex - 1);
  }
  const row = shell.main.querySelector(`[data-id="${item.id}"]`);
  if (row) {
    row.classList.add("is-pending-hide");
    row.style.setProperty("--shn-hide-ms", `${HIDE_UNDO_MS}ms`);
  }
  setSelectedRow(shell.main, state.selectedIndex);
  const timer = setTimeout(() => {
    commitPendingHide(item.id);
  }, HIDE_UNDO_MS);
  pendingHides.set(item.id, {
    timer,
    item,
    title,
    startedAt: Date.now()
  });
  shell.showUndoToast?.({
    title,
    durationMs: HIDE_UNDO_MS,
    onUndo: () => undoHide(item.id)
  });
  shell.setStatus(
    `Hiding\u2026 press u to undo (${Math.round(HIDE_UNDO_MS / 1e3)}s)`,
    "info"
  );
}
function cancelAllPendingHides() {
  for (const [, p] of pendingHides) {
    clearTimeout(p.timer);
    p.item._pendingHide = false;
  }
  pendingHides.clear();
  shell?.hideUndoToast?.();
}
function undoHide(preferId) {
  if (state.route?.kind !== "list") {
    shell.setStatus("Nothing to undo here.", "info");
    return;
  }
  let id = preferId ?? null;
  if (id == null) {
    const sel = state.items[state.selectedIndex];
    if (sel?._pendingHide && pendingHides.has(sel.id)) {
      id = sel.id;
    } else {
      const keys = [...pendingHides.keys()];
      id = keys.length ? keys[keys.length - 1] : null;
    }
  }
  if (id == null || !pendingHides.has(id)) {
    shell.setStatus("Nothing left to undo.", "info");
    return;
  }
  const pending = pendingHides.get(id);
  clearTimeout(pending.timer);
  pendingHides.delete(id);
  pending.item._pendingHide = false;
  const row = shell.main.querySelector(`[data-id="${id}"]`);
  if (row) {
    row.classList.remove("is-pending-hide");
    row.style.removeProperty("--shn-hide-ms");
  }
  const idx = state.items.findIndex((x) => x.id === id);
  if (idx >= 0) {
    state.selectedIndex = idx;
    setSelectedRow(shell.main, idx);
  }
  refreshUndoToast();
  shell.setStatus("Hide undone.", "ok");
}
async function commitPendingHide(id) {
  const pending = pendingHides.get(id);
  if (!pending) return;
  pendingHides.delete(id);
  const { item } = pending;
  item._pendingHide = false;
  try {
    await hideItem(id);
    state.settings = await loadSettings();
  } catch {
  }
  hideOnHn(id).catch(() => {
  });
  const idx = state.items.findIndex((x) => x.id === id);
  state.items = state.items.filter((x) => x.id !== id);
  if (idx >= 0) {
    if (state.selectedIndex > idx) state.selectedIndex -= 1;
    if (state.selectedIndex >= state.items.length) {
      state.selectedIndex = Math.max(0, state.items.length - 1);
    }
  }
  paintList();
  refreshUndoToast();
  shell.setStatus("Hidden.", "ok");
}
function refreshUndoToast() {
  if (!pendingHides.size) {
    shell.hideUndoToast?.();
    return;
  }
  const keys = [...pendingHides.keys()];
  const lastId = keys[keys.length - 1];
  const last = pendingHides.get(lastId);
  if (!last) return;
  const remaining = Math.max(
    200,
    HIDE_UNDO_MS - (Date.now() - last.startedAt)
  );
  shell.showUndoToast?.({
    title: last.title,
    durationMs: remaining,
    onUndo: () => undoHide(lastId)
  });
}
function collapseSelected() {
  if (state.route.kind !== "thread") return;
  if (state.selectedIndex === 0) return;
  const entry = getFlatEntry(state.tree, state.selectedIndex);
  if (!entry?.item) return;
  toggleCollapsed(state.tree, entry.item.id);
  paintThread();
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// src/content.ts
(function early() {
  try {
    const s = document.createElement("style");
    s.textContent = "html,body{background:#1a1410!important} body>center,body>table{opacity:0!important}";
    (document.documentElement || document).appendChild(s);
  } catch {
  }
})();
(async function boot() {
  try {
    if (document.body) {
      await init();
    } else {
      await new Promise((resolve) => {
        const done = () => {
          document.removeEventListener("DOMContentLoaded", done);
          resolve();
        };
        document.addEventListener("DOMContentLoaded", done);
      });
      await init();
    }
  } catch (err) {
    console.error("[hackerNews4me.crx] failed to start", err);
  }
})();
//# sourceMappingURL=content.js.map
