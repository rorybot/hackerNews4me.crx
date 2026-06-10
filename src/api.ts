import type { HnItem, ListKey, Route } from "./types";

const API = "https://hacker-news.firebaseio.com/v0";

const itemCache = new Map<number, HnItem>();

const STORY_LISTS: Record<ListKey, string> = {
  top: "topstories",
  new: "newstories",
  best: "beststories",
  ask: "askstories",
  show: "showstories",
  job: "jobstories",
};

export function routeFromLocation(pathname: string, search: string): Route {
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

export async function fetchStoryIds(listKey: ListKey): Promise<number[]> {
  const endpoint = STORY_LISTS[listKey] || STORY_LISTS.top;
  const res = await fetch(`${API}/${endpoint}.json`);
  if (!res.ok) throw new Error(`Failed to load ${endpoint}: ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((x): x is number => typeof x === "number");
}

export async function fetchItem(
  id: number,
  opts: { force?: boolean } = {}
): Promise<HnItem | null> {
  if (!opts.force && itemCache.has(id)) return itemCache.get(id) ?? null;
  const res = await fetch(`${API}/item/${id}.json`);
  if (!res.ok) throw new Error(`Failed to load item ${id}: ${res.status}`);
  const item = (await res.json()) as HnItem | null;
  if (item && typeof item.id === "number") itemCache.set(id, item);
  return item;
}

export async function fetchItems(
  ids: number[],
  concurrency = 12
): Promise<HnItem[]> {
  const results: Array<HnItem | null> = new Array(ids.length);
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];
      if (id === undefined) continue;
      try {
        results[idx] = await fetchItem(id);
      } catch {
        results[idx] = null;
      }
    }
  }

  const n = Math.min(concurrency, Math.max(ids.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results.filter((x): x is HnItem => Boolean(x));
}

export async function fetchStoriesSortedByPoints(opts: {
  listKey?: ListKey;
  windowHours?: number;
  poolSize?: number;
  hiddenIds?: number[] | Set<number>;
  limit?: number;
}): Promise<{
  items: HnItem[];
  scanned: number;
  matched: number;
  windowHours: number;
}> {
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
      /* keep primary */
    }
  }

  const seen = new Set<number>();
  const capped: number[] = [];
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

export async function fetchCommentTree(
  root: HnItem,
  maxDepth = 12
): Promise<HnItem> {
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

export function timeAgo(unixSeconds?: number): string {
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

export function domainOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function clearItemCache(): void {
  itemCache.clear();
}
