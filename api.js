const API = "https://hacker-news.firebaseio.com/v0";

/** @type {Map<number, object>} */
const itemCache = new Map();

const STORY_LISTS = {
  top: "topstories",
  new: "newstories",
  best: "beststories",
  ask: "askstories",
  show: "showstories",
  job: "jobstories",
};

/**
 * Map a news.ycombinator.com pathname to a list key or thread id.
 * @param {string} pathname
 * @param {string} search
 */
export function routeFromLocation(pathname, search) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);

  if (path === "/item") {
    const id = Number(params.get("id"));
    if (id) return { kind: "thread", id };
  }

  if (path === "/" || path === "/news") return { kind: "list", list: "top" };
  if (path === "/newest") return { kind: "list", list: "new" };
  if (path === "/best") return { kind: "list", list: "best" };
  if (path === "/ask") return { kind: "list", list: "ask" };
  if (path === "/show") return { kind: "list", list: "show" };
  if (path === "/jobs") return { kind: "list", list: "job" };
  if (path === "/front") return { kind: "list", list: "top" };

  // Fallbacks: user, submit, etc. — still show top as home-ish
  if (path.startsWith("/")) {
    return { kind: "list", list: "top", note: path };
  }

  return { kind: "list", list: "top" };
}

/**
 * @param {string} listKey
 * @returns {Promise<number[]>}
 */
export async function fetchStoryIds(listKey) {
  const endpoint = STORY_LISTS[listKey] || STORY_LISTS.top;
  const res = await fetch(`${API}/${endpoint}.json`);
  if (!res.ok) throw new Error(`Failed to load ${endpoint}: ${res.status}`);
  return res.json();
}

/**
 * @param {number} id
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchItem(id, opts = {}) {
  if (!opts.force && itemCache.has(id)) return itemCache.get(id);
  const res = await fetch(`${API}/item/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load item ${id}: ${res.status}`);
  const item = await res.json();
  if (item) itemCache.set(id, item);
  return item;
}

/**
 * Fetch many items with limited concurrency.
 * @param {number[]} ids
 * @param {number} [concurrency]
 */
export async function fetchItems(ids, concurrency = 12) {
  const results = new Array(ids.length);
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];
      try {
        results[idx] = await fetchItem(id);
      } catch {
        results[idx] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results.filter(Boolean);
}

/**
 * Approximate "top by points" for a recent window.
 * HN has no server-side sort, so we sample a pool of IDs, filter by age,
 * and sort client-side by score.
 *
 * @param {object} opts
 * @param {string} [opts.listKey]  Base feed to sample (top/new/ask/…)
 * @param {number} [opts.windowHours=72]
 * @param {number} [opts.poolSize=200]  How many IDs to fetch details for
 * @param {Set<number>|number[]} [opts.hiddenIds]
 * @param {number} [opts.limit=30]
 * @returns {Promise<{ items: object[], scanned: number, windowHours: number }>}
 */
export async function fetchStoriesSortedByPoints(opts = {}) {
  const listKey = opts.listKey || "top";
  const windowHours = opts.windowHours ?? 72;
  const poolSize = opts.poolSize ?? 200;
  const limit = opts.limit ?? 30;
  const hidden = new Set(opts.hiddenIds || []);

  // Sample current feed; for "top" also blend in newest so hot-but-new posts appear.
  const primary = await fetchStoryIds(listKey);
  let poolIds = [...primary];

  if (listKey === "top" || listKey === "best") {
    try {
      const newest = await fetchStoryIds("new");
      poolIds = [...primary.slice(0, Math.ceil(poolSize * 0.65)), ...newest];
    } catch {
      /* keep primary only */
    }
  }

  // Dedupe, drop hidden, cap pool
  const seen = new Set();
  const capped = [];
  for (const id of poolIds) {
    if (hidden.has(id) || seen.has(id)) continue;
    seen.add(id);
    capped.push(id);
    if (capped.length >= poolSize) break;
  }

  const raw = await fetchItems(capped, 16);
  const cutoff = Math.floor(Date.now() / 1000) - windowHours * 3600;

  const eligible = raw.filter((item) => {
    if (!item || item.deleted || item.dead) return false;
    // Keep stories / jobs / polls — skip pure comments if any slip in
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
    windowHours,
  };
}

/**
 * Recursively load kids for a comment tree (depth-first batching by level).
 * @param {object} root
 * @param {number} [maxDepth]
 */
export async function fetchCommentTree(root, maxDepth = 12) {
  if (!root?.kids?.length || maxDepth <= 0) {
    return { ...root, children: [] };
  }

  const children = await fetchItems(root.kids);
  const withKids = await Promise.all(
    children
      .filter((c) => c && !c.deleted && !c.dead)
      .map((c) => fetchCommentTree(c, maxDepth - 1))
  );
  return { ...root, children: withKids };
}

/** Relative age string */
export function timeAgo(unixSeconds) {
  if (!unixSeconds) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
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

/** Hostname from URL, or empty */
export function domainOf(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function clearItemCache() {
  itemCache.clear();
}
