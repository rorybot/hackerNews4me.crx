import {
  routeFromLocation,
  fetchStoryIds,
  fetchItems,
  fetchItem,
  fetchCommentTree,
  fetchStoriesSortedByPoints,
} from "./api.js";
import { loadSettings, saveSettings, hideItem } from "./storage.js";
import { bindKeyboard } from "./keyboard.js";
import {
  upvote,
  hideOnHn,
  checkLogin,
  openBackgroundTab,
} from "./actions.js";
import { renderShell } from "./ui/shell.js";
import { renderList, setSelectedRow } from "./ui/list.js";
import {
  renderThread,
  toggleCollapsed,
  getFlatEntry,
} from "./ui/thread.js";

const PAGE_SIZE = 30;
/** How long hide stays undoable (ms). Match CSS animation. */
const HIDE_UNDO_MS = 4800;

/** @type {ReturnType<typeof renderShell> | null} */
let shell = null;
/** @type {object} */
let state = {
  route: null,
  settings: null,
  items: [],
  selectedIndex: 0,
  tree: null,
  story: null,
  login: { loggedIn: false, user: null },
  page: 0,
};

/**
 * Pending hides: id → { timer, item, title, startedAt }
 * @type {Map<number, { timer: ReturnType<typeof setTimeout>, item: object, title: string, startedAt: number }>}
 */
const pendingHides = new Map();

export async function init() {
  document.documentElement.classList.add("shn-active");

  // Stop HN's own bits from flashing / running hard
  try {
    document.documentElement.style.background = "#1a1410";
  } catch {
    /* ignore */
  }

  state.settings = await loadSettings();
  state.login = await checkLogin();
  state.route = routeFromLocation(location.pathname, location.search);

  shell = renderShell({
    activeList: state.route.kind === "list" ? state.route.list : null,
    user: state.login.user,
    onNav: (href) => navigate(href),
  });

  // Clear body and mount
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
    onGo: (path) => navigate(path),
  });

  // Client-side nav for our links
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
  // Rebuild shell nav active state
  document.body.textContent = "";
  shell = renderShell({
    activeList: state.route.kind === "list" ? state.route.list : null,
    user: state.login.user,
    onNav: (href) => navigate(href),
  });
  document.body.appendChild(shell.root);
  reload();
}

async function reload() {
  if (!shell) return;
  cancelAllPendingHides();
  shell.main.innerHTML = `<div class="shn-loading">Loading…</div>`;
  shell.setStatus("");

  try {
    if (state.route.kind === "thread") {
      await loadThread(state.route.id);
    } else {
      await loadList(state.route.list);
    }
  } catch (e) {
    shell.main.innerHTML = `<div class="shn-empty">Failed to load. ${escapeHtml(
      String(e.message || e)
    )}</div>`;
    shell.setStatus(String(e.message || e), "error");
  }
}

async function loadList(listKey) {
  const hidden = state.settings.hiddenIds || [];
  const pageSize = state.settings.pageSize || PAGE_SIZE;
  const sortByPoints = Boolean(state.settings.sortByPoints);
  const windowHours = state.settings.sortWindowHours || 72;

  if (sortByPoints) {
    shell.setStatus(`Sorting by pts · last ${windowHours}h (sampling feed)…`);
    const result = await fetchStoriesSortedByPoints({
      listKey,
      windowHours,
      poolSize: 200,
      hiddenIds: hidden,
      limit: pageSize,
    });
    state.items = result.items;
    state.selectedIndex = Math.min(
      state.selectedIndex,
      Math.max(0, state.items.length - 1)
    );
    shell.setStatus(
      `pts↓ · last ${result.windowHours}h · ${result.items.length} shown · scanned ${result.scanned}`,
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
    onToggleSortByPoints: () => toggleSortByPoints(),
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
  shell.setStatus("Loading comments…");
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
    },
  });
}

function moveSelection(delta) {
  if (state.route.kind === "list") {
    const max = state.items.length;
    if (!max) return;
    state.selectedIndex = clamp(state.selectedIndex + delta, 0, max - 1);
    setSelectedRow(shell.main, state.selectedIndex);
    return;
  }

  // Thread: recount flat length by re-querying DOM
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

/** l / o — open story URL in a background tab */
function openSelected() {
  if (state.route.kind === "list") {
    const item = state.items[state.selectedIndex];
    if (!item) return;
    const url = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
    openBackgroundTab(url);
    return;
  }
  // Thread: always open the story link (not comment permalink)
  if (state.story) {
    const url =
      state.story.url ||
      `https://news.ycombinator.com/item?id=${state.story.id}`;
    openBackgroundTab(url);
  }
}

/** Enter — open comments in-app */
function openCommentsSelected() {
  if (state.route.kind === "list") {
    const item = state.items[state.selectedIndex];
    if (!item) return;
    navigate(`/item?id=${item.id}`);
    return;
  }
  // Already on a thread — scroll to first comment if any
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

  const btn =
    shell.main.querySelector(".is-selected .shn-vote-btn") ||
    shell.main.querySelector(`[data-id="${item.id}"] .shn-vote-btn`);
  await upvoteItem(item, btn);
}

/**
 * @param {object} item
 * @param {HTMLElement | null} [btn]
 */
async function upvoteItem(item, btn) {
  if (!item?.id) return;
  if (item._upvoted) {
    shell.setStatus("Already upvoted.", "info");
    return;
  }

  btn?.classList.add("is-pending");
  shell.setStatus("Upvoting…");
  const result = await upvote(item.id);
  btn?.classList.remove("is-pending");

  if (result.ok) {
    item._upvoted = true;
    if (typeof item.score === "number") item.score += 1;
    btn?.classList.add("is-voted");
    shell.setStatus("Upvoted.", "ok");

    // Refresh points cell on list without full repaint when possible
    const row = shell.main.querySelector(`[data-id="${item.id}"]`);
    const pts = row?.querySelector('[data-role="points"]');
    if (pts && item.score != null) pts.textContent = String(item.score);

    const sel = shell.main.querySelector(".is-selected");
    sel?.classList.add("shn-flash-ok");
  } else {
    shell.setStatus(result.reason || "Upvote failed", "error");
  }
}

/**
 * Hide with RES-style undo window:
 * row dims + green glow, selection advances, press `u` to restore
 * until the animation finishes — then hide is committed.
 */
function hideSelected() {
  if (state.route.kind !== "list") {
    shell.setStatus("Hide works on list pages (local + HN).", "error");
    return;
  }
  const fromIndex = state.selectedIndex;
  const item = state.items[fromIndex];
  if (!item) return;

  if (item._pendingHide || pendingHides.has(item.id)) {
    shell.setStatus("Already hiding — press u to undo.", "info");
    return;
  }

  item._pendingHide = true;
  const title = item.title || `item ${item.id}`;

  // Advance selection (next, or previous if we hid the last row)
  if (fromIndex < state.items.length - 1) {
    state.selectedIndex = fromIndex + 1;
  } else {
    state.selectedIndex = Math.max(0, fromIndex - 1);
  }

  // Animate in-place without full repaint (keeps glow continuous)
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
    startedAt: Date.now(),
  });
  shell.showUndoToast?.({
    title,
    durationMs: HIDE_UNDO_MS,
    onUndo: () => undoHide(item.id),
  });
  shell.setStatus(
    `Hiding… press u to undo (${Math.round(HIDE_UNDO_MS / 1000)}s)`,
    "info"
  );
}

/** Drop pending hides without committing (nav / refresh). */
function cancelAllPendingHides() {
  for (const [, p] of pendingHides) {
    clearTimeout(p.timer);
    p.item._pendingHide = false;
  }
  pendingHides.clear();
  shell?.hideUndoToast?.();
}

/**
 * @param {number} [preferId]  Undo this id, else selected pending, else most recent
 */
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

/**
 * Commit hide for real: storage + HN + remove from list.
 * @param {number} id
 */
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
    /* still remove from view */
  }

  // Best-effort remote hide (don't block UI)
  hideOnHn(id).catch(() => {});

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
  // Most recent still-pending hide, with remaining bar time
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
    onUndo: () => undoHide(lastId),
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

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
