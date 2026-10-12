import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of ["index.html", "styles.css", "app.js", "assets"]) {
  await cp(join(root, entry), join(dist, entry), { recursive: true });
}
console.log("Landing built to apps/landing/dist");
