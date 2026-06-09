# hackerNews4me.crx

Personal Brave extension for Hacker News: table layout, sandy chill-hop theme, RES-style keyboard shortcuts. Sideload only — not for the store.

## Features (v0.1)

- **Full-page UI** on `news.ycombinator.com` (list + threads)
- **Table list** with **visible drag bars** to resize columns (widths sync via `chrome.storage.sync`)
- **Retro TUI** over a pixel chill-hop backdrop (sharp panels, scanlines — no blur)
- **HN Firebase API** for reads (no API key)
- **▲ upvote** buttons on stories and comments
- Keyboard: **Enter** = comments, **l** = story (bg tab) — see full table below

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous item (or comment) |
| `Enter` | Open **comments** (in-app) |
| `l` / `o` | Open **story** link in a **background** tab |
| `a` | Upvote focused item (requires HN login) — or click the **▲** button |
| `x` | Hide story — row glows green; press **`u`** to undo before it fades out |
| `u` | Undo hide (while the glow/toast is still active) |
| `h` | Collapse / expand focused comment (thread) |
| `r` | Refresh |
| `g` then `h` | Go to **Top** |
| `g` then `n` | Go to **Newest** |
| `g` then `a` | Go to **Ask** |
| `g` then `s` | Go to **Show** |
| `g` then `j` | Go to **Jobs** |
| `?` | Toggle on-page help |

Also press **`?`** in the UI, or the **?** button in the top bar.

**Columns:** drag the vertical bars in the table header (between columns) to resize. Widths are saved.

**Upvote:** click the **`^`** in the first column (or on a comment), or press `a`.

**Sort by points:** click the **PTS** header (or the `sort:` chip in the title bar). This is approximate — HN has no official “top by score” API, so Sandy samples ~200 stories from the current feed (and newest, on Top/Best), keeps those from the last **72 hours**, and sorts them by score. Click again to restore normal feed order. Preference is saved.

## Install in Brave (sideload)

1. Open `brave://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder (`hackerNews`)
4. Open [https://news.ycombinator.com](https://news.ycombinator.com)

To update after code changes: on `brave://extensions`, hit the refresh icon on **hackerNews4me.crx**.

## Login (upvote / hide on HN)

1. Log into HN normally in this Brave profile: [login](https://news.ycombinator.com/login)
2. Reload HN so hackerNews4me.crx re-detects your user
3. `a` / `x` use your session cookies — no extra keys

If upvote fails, you’re usually logged out or already voted.

## Sync across machines

Settings (column widths, hidden ids) use **`chrome.storage.sync`**.

In Brave: turn on **Sync** for this profile. Extension storage syncs with Chromium sync when available; otherwise it stays on this device. Large caches are not synced.

## Permissions

- `storage` — prefs / hidden stories  
- `tabs` — open links in background tabs  
- `news.ycombinator.com` — page takeover + vote/hide  
- `hacker-news.firebaseio.com` — official read API  

## Layout

```
manifest.json
background.js      # background tabs
content.js         # boot + import app
app.js             # router / state
api.js             # Firebase HN API
actions.js         # upvote / hide / open tab
storage.js
keyboard.js
styles.css
assets/chill-bg.svg
ui/shell.js
ui/list.js
ui/thread.js
icons/
```

## Notes

- Background is a local pixel SVG (`assets/chill-bg.svg`) with UI panels using `backdrop-filter` blur — no Tailwind build step (keeps the extension simple to sideload).
- Theme is intentionally a bit dimmer than a flat “paper” page so the backdrop can read through.
