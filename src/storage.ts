import type { ColumnWidths, Settings } from "./types";

const DEFAULTS: Settings = {
  columnWidths: {
    vote: 44,
    rank: 48,
    title: 0,
    points: 72,
    comments: 72,
    age: 64,
    by: 120,
  },
  pageSize: 30,
  hiddenIds: [],
  sortByPoints: false,
  sortWindowHours: 72,
};

function area(): chrome.storage.StorageArea {
  try {
    if (chrome?.storage?.sync) return chrome.storage.sync;
  } catch {
    /* ignore */
  }
  return chrome.storage.local;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function sanitizeColumnWidths(raw: unknown): ColumnWidths {
  const d = DEFAULTS.columnWidths;
  if (!isRecord(raw)) return { ...d };
  const num = (k: keyof ColumnWidths) => {
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
    by: num("by"),
  };
}

/** Validate and clamp settings from storage (untrusted). */
export function normalizeSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const hiddenIds = Array.isArray(r.hiddenIds)
    ? r.hiddenIds
        .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
        .map((x) => Math.trunc(x))
        .slice(-500)
    : [];

  const pageSize =
    typeof r.pageSize === "number" && r.pageSize > 0 && r.pageSize <= 100
      ? Math.trunc(r.pageSize)
      : DEFAULTS.pageSize;

  const sortWindowHours =
    typeof r.sortWindowHours === "number" &&
    r.sortWindowHours > 0 &&
    r.sortWindowHours <= 24 * 14
      ? Math.trunc(r.sortWindowHours)
      : DEFAULTS.sortWindowHours;

  return {
    columnWidths: sanitizeColumnWidths(r.columnWidths),
    pageSize,
    hiddenIds,
    sortByPoints: Boolean(r.sortByPoints),
    sortWindowHours,
  };
}

export async function loadSettings(): Promise<Settings> {
  const store = area();
  return new Promise((resolve) => {
    store.get({ ...DEFAULTS } as Record<string, unknown>, (data) => {
      resolve(normalizeSettings({ ...DEFAULTS, ...data }));
    });
  });
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const store = area();
  // Never write unexpected keys
  const safe: Record<string, unknown> = {};
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

export async function hideItem(id: number): Promise<number[]> {
  const settings = await loadSettings();
  const set = new Set(settings.hiddenIds);
  set.add(Math.trunc(id));
  const hiddenIds = [...set].slice(-500);
  await saveSettings({ hiddenIds });
  return hiddenIds;
}

export async function unhideItem(id: number): Promise<number[]> {
  const settings = await loadSettings();
  const hiddenIds = settings.hiddenIds.filter((x) => x !== Math.trunc(id));
  await saveSettings({ hiddenIds });
  return hiddenIds;
}
