// @ts-nocheck
import { timeAgo, domainOf } from "../api";
import { openBackgroundTab } from "../actions";
import { setSanitizedHtml } from "../sanitize";

/**
 * Flatten tree to a navigable list of comment nodes with depth.
 * @param {object} node
 * @param {number} depth
 * @param {object[]} acc
 */
function flatten(node, depth, acc) {
  if (!node) return acc;
  acc.push({ item: node, depth });
  if (!node._collapsed && node.children?.length) {
    for (const child of node.children) flatten(child, depth + 1, acc);
  }
  return acc;
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object} opts.story
 * @param {object} opts.tree  // story with children comments
 * @param {number} opts.selectedIndex  // 0 = story header, then comments
 * @param {(index: number) => void} opts.onSelect
 * @param {(id: number) => void} opts.onToggleCollapse
 * @param {(item: object, btn: HTMLElement) => void} [opts.onUpvote]
 */
export function renderThread(container, opts) {
  const { story, tree, selectedIndex, onSelect, onToggleCollapse, onUpvote } =
    opts;
  container.innerHTML = "";

  const page = document.createElement("div");
  page.className = "shn-thread";

  const titlebar = document.createElement("div");
  titlebar.className = "shn-tui-titlebar shn-glass";
  titlebar.style.marginBottom = "0.5rem";
  titlebar.innerHTML = `
    <span class="shn-tui-deco" aria-hidden="true">┌</span>
    <span class="shn-tui-label">thread</span>
    <span class="shn-tui-deco" aria-hidden="true">────────</span>
    <span class="shn-tui-hint">j/k · h collapse · a vote · l open link</span>
    <span class="shn-tui-deco" aria-hidden="true">┐</span>
  `;
  page.appendChild(titlebar);

  // Story header as index 0
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
    story.descendants != null ? `${story.descendants} comments` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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

  // Comments
  const list = document.createElement("div");
  list.className = "shn-comments";

  const flat = [];
  if (tree?.children?.length) {
    for (const child of tree.children) flatten(child, 0, flat);
  }

  flat.forEach((entry, i) => {
    const index = i + 1; // 0 is story
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

    const voteBtn = makeVoteButton(item, (btn) => {
      onSelect(index);
      onUpvote?.(item, btn);
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "shn-collapse-btn";
    toggle.textContent = item._collapsed ? `[+] (${countDesc(item)})` : "[–]";
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

    bar.append(voteBtn, toggle, by, age);

    const text = document.createElement("div");
    text.className = "shn-text";
    if (item._collapsed) {
      text.hidden = true;
    } else {
      if (item.text) { setSanitizedHtml(text, item.text); } else { text.textContent = "deleted"; }
    }

    // Single content wrapper so .shn-glass > * sits above ::before frost
    const body = document.createElement("div");
    body.className = "shn-comment-inner";
    body.append(bar, text);
    el.appendChild(body);
    el.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      onSelect(index);
    });

    // Make links in comments open in background tabs
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

/**
 * @param {object} item
 * @param {(btn: HTMLButtonElement) => void} onClick
 */
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

/**
 * Find node by id in tree and toggle _collapsed.
 */
export function toggleCollapsed(tree, id) {
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

export function findFlatIndexById(tree, id) {
  const flat = [];
  if (tree?.children) {
    for (const c of tree.children) flatten(c, 0, flat);
  }
  return flat.findIndex((e) => e.item.id === id) + 1; // +1 for story header
}

export function getFlatEntry(tree, selectedIndex) {
  if (selectedIndex === 0) return { kind: "story", item: tree };
  const flat = [];
  if (tree?.children) {
    for (const c of tree.children) flatten(c, 0, flat);
  }
  const entry = flat[selectedIndex - 1];
  return entry ? { kind: "comment", item: entry.item, depth: entry.depth } : null;
}
