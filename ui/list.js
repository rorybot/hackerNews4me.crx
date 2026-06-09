import { domainOf, timeAgo } from "../api.js";
import { openBackgroundTab } from "../actions.js";

const COLS = [
  { key: "vote", label: "^", min: 36, max: 56, default: 44 },
  { key: "rank", label: "#", min: 36, max: 80, default: 48 },
  { key: "title", label: "TITLE", min: 160, max: 900, default: 0 }, // 0 = flex grow
  { key: "points", label: "PTS", min: 48, max: 120, default: 72 },
  { key: "comments", label: "CMT", min: 48, max: 120, default: 72 },
  { key: "age", label: "AGE", min: 48, max: 120, default: 64 },
  { key: "by", label: "BY", min: 72, max: 220, default: 120 },
];

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object[]} opts.items
 * @param {number} opts.offset
 * @param {Record<string, number>} opts.columnWidths
 * @param {number} opts.selectedIndex
 * @param {boolean} [opts.sortByPoints]
 * @param {number} [opts.sortWindowHours]
 * @param {(index: number) => void} opts.onSelect
 * @param {(widths: Record<string, number>, persist: boolean) => void} opts.onResize
 * @param {(item: object) => void} [opts.onOpen]
 * @param {(item: object) => void} [opts.onComments]
 * @param {(item: object, btn: HTMLElement) => void} [opts.onUpvote]
 * @param {() => void} [opts.onToggleSortByPoints]
 */
export function renderList(container, opts) {
  const {
    items,
    offset,
    columnWidths,
    selectedIndex,
    onSelect,
    onResize,
    sortByPoints = false,
    sortWindowHours = 72,
  } = opts;

  container.innerHTML = "";
  const shell = document.createElement("div");
  shell.className = "shn-table-shell shn-glass";

  const titlebar = document.createElement("div");
  titlebar.className = "shn-tui-titlebar";
  const sortHint = sortByPoints
    ? `sort: pts↓ · ${sortWindowHours}h`
    : "sort: feed order";
  titlebar.innerHTML = `
    <span class="shn-tui-deco" aria-hidden="true">┌</span>
    <span class="shn-tui-label">stories</span>
    <span class="shn-tui-deco" aria-hidden="true">─</span>
    <button type="button" class="shn-tui-sort-btn" title="Toggle sort by points (last ${sortWindowHours}h)">${sortHint}</button>
    <span class="shn-tui-deco" aria-hidden="true">────────</span>
    <span class="shn-tui-hint">j/k · enter · l · a · x hide · u undo</span>
    <span class="shn-tui-deco" aria-hidden="true">┐</span>
  `;
  titlebar.querySelector(".shn-tui-sort-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    opts.onToggleSortByPoints?.();
  });
  shell.appendChild(titlebar);

  const wrap = document.createElement("div");
  wrap.className = "shn-table-wrap";

  const table = document.createElement("div");
  table.className = "shn-table";
  table.setAttribute("role", "table");

  // Header
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
      label.textContent = sortByPoints ? "PTS↓" : "PTS";
      label.classList.add("shn-sort-label");
      if (sortByPoints) label.classList.add("is-active");
      label.title = sortByPoints
        ? `Sorted by points (last ${sortWindowHours}h). Click to restore feed order.`
        : `Sort by points among stories from the last ${sortWindowHours}h (approx).`;
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
        // Don't fire when dragging the resize bar
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

  // Body
  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "shn-row shn-item";
    row.setAttribute("role", "row");
    row.dataset.index = String(index);
    row.dataset.id = String(item.id);
    if (index === selectedIndex) row.classList.add("is-selected");
    if (item._pendingHide) {
      row.classList.add("is-pending-hide");
      row.title = "Hiding… press u to undo";
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
    points.textContent = item.score != null ? String(item.score) : "–";
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
    age.title = item.time ? new Date(item.time * 1000).toLocaleString() : "";
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

    // Double-click row → comments (Enter equivalent)
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
  shell.appendChild(wrap);
  container.appendChild(shell);

  const sel = table.querySelector(".shn-row.is-selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

function makeResizeBar(col, columnWidths, onResize, table) {
  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "shn-resize-bar";
  bar.title = `Drag to resize “${col.label}”`;
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

export function setSelectedRow(container, index) {
  container.querySelectorAll(".shn-row.shn-item").forEach((row) => {
    row.classList.toggle("is-selected", Number(row.dataset.index) === index);
  });
  const sel = container.querySelector(".shn-row.is-selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}
