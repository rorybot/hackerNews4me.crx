# hackerNews4me.crx

Personal **Brave / Chromium** extension that replaces the Hacker News UI with a darker, leathery table layout, RES-style keyboard navigation, and a few decorative extras (chill-hop backdrop, pitchside England WC banner).

**Sideload only** — not on the Chrome Web Store. Source is TypeScript; load the built files from **`dist/`**.

## Install

1. Clone this repo (or download a ZIP)
2. Optional: `npm install` && `npm run build` to rebuild `dist/`
3. Open `brave://extensions` (or `chrome://extensions`)
4. Enable **Developer mode**
5. **Load unpacked** → select the **`dist`** folder
6. Open [news.ycombinator.com](https://news.ycombinator.com)

After code changes: `npm run build`, then click the refresh icon on the extension card.

## Features

- **Story list** as a resizable table (drag column dividers; widths persist)
- **In-app comment threads** with collapse/expand
- **Keyboard-first navigation** (see below)
- **PTS sort** — click the **PTS** header (or the sort button) to rank by points among a sample of ~200 feed IDs from the last **72 hours** (approximate; no official HN API for this). Click again for feed order.
- Vote / hide using your existing HN session (log in on that browser profile)
- Decorative stadium banner with next England fixture (WC 2026 schedule in `src/fixtures/england.ts`)

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous item (or comment) |
| `Enter` | Open comments (in-app) |
| `l` / `o` | Open story link in a background tab |
| `a` | Upvote (or click **▲**) |
| `x` | Hide — green glow; press **`u`** to undo before it fades |
| `u` | Undo hide |
| `h` | Collapse / expand comment (thread) |
| `r` | Refresh |
| `g` then `h` / `n` / `a` / `s` / `j` | Top / Newest / Ask / Show / Jobs |
| `?` | Help |

## Security

See **[SECURITY.md](./SECURITY.md)** for the full threat model.

Short version: reads the public HN Firebase API; vote/hide use your session cookies only when you act; HTML from the API is allowlist-sanitized; background tabs only open `http`/`https` URLs; no analytics, no remote code, no broad host access.

## Dev

```bash
npm install
npm run build      # → dist/
npm run typecheck  # tsc --noEmit
```

### Layout

```
src/                 TypeScript source
  content.ts         Content-script entry
  background.ts      Service worker
  app.ts             Router / state
  api.ts             Firebase HN client
  actions.ts         Vote / hide / open tab
  sanitize.ts        HTML + URL hardening
  storage.ts         chrome.storage prefs
  keyboard.ts
  fixtures/          England match schedule (banner)
  ui/
scripts/build.mjs    esbuild + copy assets
dist/                Load this folder unpacked
styles.css
assets/
```

## License

MIT — see [LICENSE](./LICENSE).
