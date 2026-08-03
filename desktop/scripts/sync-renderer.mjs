import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(DESKTOP_DIR, "..");
const WEB_BUILD = path.join(REPO_ROOT, "excalidraw-app", "build");
const RENDERER = path.join(DESKTOP_DIR, "renderer");
const ICON_SOURCE = path.join(REPO_ROOT, "public", "android-chrome-512x512.png");
const ICON_TARGET = path.join(DESKTOP_DIR, "icon.png");

const exists = async (target) =>
  await fs.access(target).then(
    () => true,
    () => false,
  );

if (!(await exists(path.join(WEB_BUILD, "index.html")))) {
  console.error(
    [
      `No web build found at ${WEB_BUILD}`,
      "",
      "Build it first, from the repo root:",
      "  yarn build:app:docker",
    ].join("\n"),
  );
  process.exit(1);
}

await fs.rm(RENDERER, { recursive: true, force: true });
await fs.cp(WEB_BUILD, RENDERER, { recursive: true });
await fs.copyFile(ICON_SOURCE, ICON_TARGET);

const countFiles = async (dir) => {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory()
      ? await countFiles(path.join(dir, entry.name))
      : 1;
  }
  return total;
};

console.log(`synced ${await countFiles(RENDERER)} files into desktop/renderer`);
