/**
 * Vote / hide via HN session cookies (same-origin fetch from content script).
 * Parses the live HTML for auth tokens — no extra keys required.
 * You must be logged into news.ycombinator.com in this Brave profile.
 */

function decodeHref(href) {
  return href.replace(/&amp;/g, "&");
}

/**
 * @param {number} id
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function upvote(id) {
  try {
    const html = await fetchHtml(`https://news.ycombinator.com/item?id=${id}`);
    if (looksLoggedOut(html)) {
      return {
        ok: false,
        reason:
          "Not logged into HN. Log in on news.ycombinator.com, then retry.",
      };
    }
    // Unvoted: vote?id=…&how=up…  (entity-encoded in HTML)
    let m = html.match(
      new RegExp(`href="(vote\\?id=${id}&amp;how=up[^"]*)"`, "i")
    );
    if (!m) {
      m = html.match(
        new RegExp(`href="(vote\\?id=${id}&how=up[^"]*)"`, "i")
      );
    }
    if (!m) {
      return {
        ok: false,
        reason: "No upvote link (already voted, or not available).",
      };
    }
    const url = "https://news.ycombinator.com/" + decodeHref(m[1]);
    const res = await fetch(url, {
      credentials: "include",
      redirect: "follow",
    });
    return {
      ok:
        res.ok ||
        res.type === "opaqueredirect" ||
        res.status === 0 ||
        res.redirected,
    };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

/**
 * Hide story on HN + local hidden list handled by caller.
 * @param {number} id
 */
export async function hideOnHn(id) {
  try {
    const html = await fetchHtml(`https://news.ycombinator.com/item?id=${id}`);
    if (looksLoggedOut(html)) {
      return { ok: false, reason: "Not logged into HN." };
    }
    const re = new RegExp(`href="(hide\\?id=${id}[^"]*)"`, "i");
    const m = html.match(re);
    if (!m) {
      return { ok: false, reason: "No hide link found." };
    }
    const url = "https://news.ycombinator.com/" + decodeHref(m[1]);
    const res = await fetch(url, { credentials: "include", redirect: "follow" });
    return { ok: res.ok || res.redirected || res.status === 0 };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, { credentials: "include" });
  return res.text();
}

function looksLoggedOut(html) {
  // Logged-in pages include a logout link with auth token.
  if (/logout\?auth=/i.test(html)) return false;
  if (/class="hnuser"/i.test(html)) return false;
  return /href="login\?goto=/i.test(html);
}

/**
 * Detect login state from current (pre-takeover) or fetched page.
 */
export async function checkLogin() {
  try {
    const html = await fetchHtml("https://news.ycombinator.com/");
    const user = html.match(/class="hnuser"[^>]*>([^<]+)</i);
    const loggedIn = /logout\?auth=/i.test(html) || Boolean(user);
    return { loggedIn, user: user ? user[1] : null };
  } catch {
    return { loggedIn: false, user: null };
  }
}

/**
 * Open URL in background tab via service worker.
 * @param {string} url
 */
export function openBackgroundTab(url) {
  if (!url) return;
  chrome.runtime.sendMessage({ type: "openBackgroundTab", url });
}
