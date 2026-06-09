const DEFAULTS = {
  columnWidths: {
    vote: 44,
    rank: 48,
    title: 0, // 0 = flex
    points: 72,
    comments: 72,
    age: 64,
    by: 120,
  },
  pageSize: 30,
  hiddenIds: [],
  /** When true, list is sorted by score within sortWindowHours (approx). */
  sortByPoints: false,
  /** Only consider stories newer than this many hours when sortByPoints is on. */
  sortWindowHours: 72,
};

/**
 * Prefer sync (Brave can sync extension storage when Sync is enabled).
 * Falls back to local if sync is unavailable or fails.
 */
async function area() {
  try {
    if (chrome?.storage?.sync) return chrome.storage.sync;
  } catch {
    /* ignore */
  }
  return chrome.storage.local;
}

export async function loadSettings() {
  const store = await area();
  return new Promise((resolve) => {
    store.get(DEFAULTS, (data) => {
      resolve({ ...DEFAULTS, ...data });
    });
  });
}

export async function saveSettings(partial) {
  const store = await area();
  return new Promise((resolve) => {
    store.set(partial, () => resolve());
  });
}

export async function hideItem(id) {
  const settings = await loadSettings();
  const set = new Set(settings.hiddenIds || []);
  set.add(Number(id));
  const hiddenIds = [...set].slice(-500); // cap
  await saveSettings({ hiddenIds });
  return hiddenIds;
}

export async function unhideItem(id) {
  const settings = await loadSettings();
  const hiddenIds = (settings.hiddenIds || []).filter((x) => x !== Number(id));
  await saveSettings({ hiddenIds });
  return hiddenIds;
}
