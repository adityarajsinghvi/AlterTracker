// Fallback deploy path: bundles .open-next/assets into a JS module so the worker can serve static files itself.
// Use when the Workers static-assets upload is unavailable. Normal path: `npm run deploy`.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname, relative } from "node:path";

const root = ".open-next/assets";
const types = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg",
};
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const key = "/" + relative(root, p).split("\\").join("/");
    if (key === "/BUILD_ID") continue;
    files[key] = [types[extname(p)] ?? "application/octet-stream", readFileSync(p).toString("base64")];
  }
})(root);
writeFileSync(".open-next/embedded-assets.js", `export default ${JSON.stringify(files)};\n`);
console.log(`Embedded ${Object.keys(files).length} static files`);
