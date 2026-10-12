import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [html, css, js] = await Promise.all([
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "styles.css"), "utf8"),
  readFile(join(root, "app.js"), "utf8"),
]);

for (const id of ["result", "build", "web-flow", "validation", "revisions", "faq"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`));
}
assert.match(html, /builds.*on the website/i);
assert.match(html, /Factorio 2\.0\.77/);
assert.match(html, /Reinforced Plate/);
assert.match(html, /Reinforced Furnace/);
assert.match(html, /control\.lua/);
assert.match(html, /Space Age/);
assert.match(html, /data-action="build-mod"/);
assert.match(html, /assets\/game\/factory\.webp/);
assert.match(html, /assets\/game\/smelting\.webp/);
assert.match(html, /assets\/game\/mining-drills\.webp/);
assert.match(html, /assets\/game\/rocket\.webp/);
assert.match(html, /official Wube press kit/i);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /object-fit:cover/);
assert.match(css, /main > section \{\s*min-height:\s*100svh;/);
assert.match(js, /mymodz:build-requested/);
assert.match(js, /Reinforced Plate/);
assert.match(js, /const ru/);
assert.match(js, /target\.closest\("main > section"\)/);
console.log("landing smoke: ok");
