/**
 * Minimal HTML sanitizer for HN API comment/story bodies.
 * Allows a small tag set; strips scripts, event handlers, and dangerous URLs.
 */

const ALLOWED_TAGS = new Set([
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
  "BLOCKQUOTE",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "title", "rel", "target"]),
};

function isSafeHref(href: string): boolean {
  const t = href.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("javascript:")) return false;
  if (t.startsWith("data:")) return false;
  if (t.startsWith("vbscript:")) return false;
  // relative, http(s), mailto, ftp
  if (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("mailto:") ||
    t.startsWith("/") ||
    t.startsWith("#") ||
    t.startsWith("./") ||
    t.startsWith("../")
  ) {
    return true;
  }
  // bare paths / domains HN sometimes uses without scheme — treat as relative ok if no :
  if (!t.includes(":")) return true;
  return false;
}

/**
 * Parse untrusted HTML and return a DocumentFragment of sanitized nodes.
 */
export function sanitizeHnHtml(html: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (!html) return frag;

  const tpl = document.createElement("template");
  // Wrap so fragment parses consistently
  tpl.innerHTML = html;

  const walk = (source: Node, parent: Node) => {
    source.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent ?? ""));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as Element;
      const tag = el.tagName.toUpperCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Drop element but keep safe children
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
            // force safe target
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

/** Set element content from HN HTML safely. */
export function setSanitizedHtml(el: HTMLElement, html: string | undefined): void {
  el.replaceChildren();
  if (!html) return;
  el.appendChild(sanitizeHnHtml(html));
}

export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only allow http(s) URLs for opening tabs. */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Restrict vote/hide to news.ycombinator.com same-origin paths. */
export function isSafeHnActionUrl(url: string): boolean {
  try {
    const u = new URL(url, "https://news.ycombinator.com/");
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.hostname !== "news.ycombinator.com") return false;
    // only vote / hide style paths
    if (!/^\/(vote|hide|fave)/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
