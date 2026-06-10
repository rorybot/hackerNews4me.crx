import { readFileSync, writeFileSync, mkdirSync } from "fs";

mkdirSync("src/ui", { recursive: true });
mkdirSync("src/fixtures", { recursive: true });

const map = {
  "ui/list.js": "src/ui/list.ts",
  "ui/thread.js": "src/ui/thread.ts",
  "ui/shell.js": "src/ui/shell.ts",
  "ui/banner.js": "src/ui/banner.ts",
  "assets/england-fixtures.js": "src/fixtures/england.ts",
  "app.js": "src/app.ts",
};

const replacements = [
  [/from "\.\.\/api\.js"/g, 'from "../api"'],
  [/from "\.\.\/actions\.js"/g, 'from "../actions"'],
  [/from "\.\/banner\.js"/g, 'from "./banner"'],
  [/from "\.\.\/assets\/england-fixtures\.js"/g, 'from "../fixtures/england"'],
  [/from "\.\/api\.js"/g, 'from "./api"'],
  [/from "\.\/storage\.js"/g, 'from "./storage"'],
  [/from "\.\/keyboard\.js"/g, 'from "./keyboard"'],
  [/from "\.\/actions\.js"/g, 'from "./actions"'],
  [/from "\.\/ui\/shell\.js"/g, 'from "./ui/shell"'],
  [/from "\.\/ui\/list\.js"/g, 'from "./ui/list"'],
  [/from "\.\/ui\/thread\.js"/g, 'from "./ui/thread"'],
];

for (const [from, to] of Object.entries(map)) {
  let s = readFileSync(from, "utf8");
  for (const [re, rep] of replacements) s = s.replace(re, rep);
  // Security: sanitize HN HTML instead of raw innerHTML
  s = s.replace(
    /body\.innerHTML = story\.text; \/\/ HN API returns sanitized HTML/,
    `import { setSanitizedHtml } from "../sanitize";\n    setSanitizedHtml(body, story.text);`
  );
  // fix double import if we already have import - will fix thread manually if needed
  s = s.replace(
    /text\.innerHTML = item\.text \|\| "<i>deleted<\/i>";/,
    `if (item.text) { setSanitizedHtml(text, item.text); } else { text.textContent = "deleted"; }`
  );
  writeFileSync(to, s);
  console.log("wrote", to);
}
