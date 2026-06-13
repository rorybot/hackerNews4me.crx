import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: {
    content: join(root, "src/content.ts"),
    background: join(root, "src/background.ts"),
  },
  bundle: true,
  outdir: dist,
  format: "esm",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
  // chrome is a global in extension pages / content scripts
  external: [],
});

// Static assets
cpSync(join(root, "styles.css"), join(dist, "styles.css"));
cpSync(join(root, "icons"), join(dist, "icons"), { recursive: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(join(root, "assets/chill-bg.svg"), join(dist, "assets/chill-bg.svg"));
cpSync(
  join(root, "assets/hn-eng-banner.svg"),
  join(dist, "assets/hn-eng-banner.svg")
);

const manifest = {
  manifest_version: 3,
  name: "hackerNews4me.ext",
  version: "0.2.0",
  description:
    "hackerNews4me.ext — restyles Hacker News as a retro TUI: table layout, RES-style keys, seasonal banner (England WC).",
  permissions: ["storage", "tabs"],
  host_permissions: [
    "https://news.ycombinator.com/*",
    "https://hacker-news.firebaseio.com/*",
  ],
  background: {
    service_worker: "background.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://news.ycombinator.com/*"],
      js: ["content.js"],
      css: ["styles.css"],
      run_at: "document_start",
    },
  ],
  // Only static images need to be web-accessible (bundled JS stays private)
  web_accessible_resources: [
    {
      resources: ["assets/chill-bg.svg", "assets/hn-eng-banner.svg"],
      matches: ["https://news.ycombinator.com/*"],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
};

writeFileSync(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Built extension → dist/");
