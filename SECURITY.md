# Security notes — hackerNews4me.crx

Browser extension that restyles Hacker News as a retro TUI. Written for
sideload / public source review.

## Trust boundary

| Surface | Risk | Mitigation |
|--------|------|------------|
| HN Firebase API (read) | Malicious JSON / HTML in `text` | Allowlist HTML sanitizer before DOM insert (`src/sanitize.ts`) |
| `news.ycombinator.com` fetch (vote/hide) | Open redirect / CSRF-like links | Only `vote`/`hide`/`fave` paths on `news.ycombinator.com` |
| `chrome.tabs.create` | Arbitrary URL open | Allow only `http:` / `https:` |
| `chrome.storage` | Poisoned prefs | Schema validation / clamp in `normalizeSettings` |
| Content script on HN | Page can see extension DOM | Normal isolation: page JS cannot call extension APIs; extension does not `eval` page code |
| Web accessible resources | Extension file theft | Only SVG assets exposed; JS is bundled into content/background |

## Permissions

- **`storage`** — column widths, hidden IDs, sort prefs (sync when available).
- **`tabs`** — open links in background tabs (no tab reading).
- **Host: `news.ycombinator.com`** — page takeover, session cookie for vote/hide when *you* act.
- **Host: `hacker-news.firebaseio.com`** — public read API (no secrets).

No remote code execution, no analytics, no third-party CDNs, no `eval`.

## What this extension does *not* do

- Does not exfiltrate data off-device.
- Does not inject into other origins.
- Does not request broad `<all_urls>` access.
- Does not store HN passwords (uses existing browser session cookies only).

## Residual risk (accepted)

- Vote/hide require your HN session on that profile; malware already running as
  you could abuse any extension. We do not attempt to stop that.
- HTML sanitizer is allowlist-based, not a full DOMPurify clone; sufficient for
  HN’s limited markup, not a general-purpose HTML browser.
- Supply-chain: build depends on `esbuild` / `typescript` at dev time only;
  shipped `dist/` has no npm runtime deps.

## Building from source

```bash
npm install
npm run build
```

Load **unpacked** the `dist/` folder in Brave (`brave://extensions`).
