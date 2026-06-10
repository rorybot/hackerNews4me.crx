import type { ActionResult, LoginState } from "./types";
import { isSafeHnActionUrl, isSafeHttpUrl } from "./sanitize";

function decodeHref(href: string): string {
  return href.replace(/&amp;/g, "&");
}

export async function upvote(id: number): Promise<ActionResult> {
  try {
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, reason: "Invalid item id." };
    }
    const html = await fetchHtml(`https://news.ycombinator.com/item?id=${id}`);
    if (looksLoggedOut(html)) {
      return {
        ok: false,
        reason:
          "Not logged into HN. Log in on news.ycombinator.com, then retry.",
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
        reason: "No upvote link (already voted, or not available).",
      };
    }
    const url = "https://news.ycombinator.com/" + decodeHref(m[1]);
    if (!isSafeHnActionUrl(url)) {
      return { ok: false, reason: "Blocked unexpected vote URL." };
    }
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
    return { ok: false, reason: String((e as Error).message || e) };
  }
}

export async function hideOnHn(id: number): Promise<ActionResult> {
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
      redirect: "follow",
    });
    return { ok: res.ok || res.redirected || res.status === 0 };
  } catch (e) {
    return { ok: false, reason: String((e as Error).message || e) };
  }
}

async function fetchHtml(url: string): Promise<string> {
  const u = new URL(url);
  if (u.hostname !== "news.ycombinator.com") {
    throw new Error("Refusing fetch to non-HN host");
  }
  const res = await fetch(url, { credentials: "include" });
  return res.text();
}

function looksLoggedOut(html: string): boolean {
  if (/logout\?auth=/i.test(html)) return false;
  if (/class="hnuser"/i.test(html)) return false;
  return /href="login\?goto=/i.test(html);
}

export async function checkLogin(): Promise<LoginState> {
  try {
    const html = await fetchHtml("https://news.ycombinator.com/");
    const user = html.match(/class="hnuser"[^>]*>([^<]+)</i);
    const loggedIn = /logout\?auth=/i.test(html) || Boolean(user);
    return { loggedIn, user: user?.[1] ?? null };
  } catch {
    return { loggedIn: false, user: null };
  }
}

export function openBackgroundTab(url: string): void {
  if (!url || !isSafeHttpUrl(url)) return;
  chrome.runtime.sendMessage({ type: "openBackgroundTab", url });
}
