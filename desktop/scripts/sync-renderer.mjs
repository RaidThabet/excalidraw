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

/**
 * Loudly refuse to package a web build older than the sources it came from.
 *
 * This shipped an 8-day-old renderer once: the desktop scripts copied
 * excalidraw-app/build without ever rebuilding it, so three packages went out
 * missing features that were already committed. `dist` now runs build:web
 * first, and this is the backstop for anyone running `sync` on its own.
 */
const newestSourceMtime = async (dir) => {
  let newest = 0;
  const walk = async (current) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === "build" ||
        entry.name === "dist" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(ts|tsx|js|jsx|scss|css)$/.test(entry.name)) {
        const { mtimeMs } = await fs.stat(full);
        newest = Math.max(newest, mtimeMs);
      }
    }
  };
  await walk(dir);
  return newest;
};

const buildMtime = (await fs.stat(path.join(WEB_BUILD, "index.html"))).mtimeMs;
const sourceMtime = Math.max(
  await newestSourceMtime(path.join(REPO_ROOT, "packages")),
  await newestSourceMtime(path.join(REPO_ROOT, "excalidraw-app")),
);

if (sourceMtime > buildMtime) {
  const staleBy = Math.round((sourceMtime - buildMtime) / 60000);
  console.error(
    [
      `The web build is ${staleBy} minute(s) older than the newest source file.`,
      "Packaging it would ship stale code.",
      "",
      "Rebuild first, from the repo root:",
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
