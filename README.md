# hackerNews4me.crx

Personal **Brave / Chromium** extension for [Hacker News](https://news.ycombinator.com): TUI table layout, RES-style keyboard shortcuts, translucent chill-hop backdrop, England WC pitchside LED banner.

**Sideload only** — not published to the Chrome Web Store.

Source is **TypeScript**; load the built files from **`dist/`**.

## Install (sideload)

1. Clone this repo (or download ZIP)
2. Optional: `npm install` && `npm run build` to rebuild `dist/`
3. Open `brave://extensions` (or `chrome://extensions`)
4. Enable **Developer mode**
5. **Load unpacked** → select the **`dist`** folder
6. Open [news.ycombinator.com](https://news.ycombinator.com)

After code changes: `npm run build`, then hit the refresh icon on the extension card.

## Security

See **[SECURITY.md](./SECURITY.md)** for the threat model and mitigations.

Short version:

- Reads public HN Firebase API
- Vote/hide use *your* HN session cookies only when you press keys
- HTML from the API is allowlist-sanitized before insert
- Background tab opens only `http`/`https` URLs
- No analytics, no remote code, no broad host access

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous item (or comment) |
| `Enter` | Open **comments** (in-app) |
| `l` / `o` | Open **story** link in a **background** tab |
| `a` | Upvote (or click **`^`**) |
| `x` | Hide — green glow; press **`u`** to undo before it fades |
| `u` | Undo hide |
| `h` | Collapse / expand comment (thread) |
| `r` | Refresh |
| `g` then `h` / `n` / `a` / `s` / `j` | Top / Newest / Ask / Show / Jobs |
| `?` | Help |

**PTS sort:** click **PTS** header — samples ~200 feed IDs, keeps last **72h**, sorts by score (approximate; no official HN API for this).

## Login

Log into HN in that browser profile for upvote / HN hide. No API keys.

## Dev

```bash
npm install
npm run build      # → dist/
npm run typecheck  # tsc (strict core modules)
```

### Layout

```
src/                 TypeScript source
  content.ts         Content-script entry (bundled)
  background.ts      Service worker (bundled)
  app.ts             Router / state
  api.ts             Firebase HN client
  actions.ts         Vote / hide / open tab
  sanitize.ts        HTML + URL hardening
  storage.ts         chrome.storage prefs
  keyboard.ts
  fixtures/          England match schedule for banner
  ui/
scripts/build.mjs    esbuild + copy assets
dist/                Load this folder unpacked
styles.css
assets/*.svg
```

## License

MIT — see [LICENSE](./LICENSE).
