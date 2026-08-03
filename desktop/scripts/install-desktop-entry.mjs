/**
 * Registers the built AppImage with the desktop environment.
 *
 * An AppImage is just a file — nothing tells the desktop what it is called or
 * what icon to use. Wayland compositors resolve a window's icon by matching its
 * app_id against an installed desktop entry, so without this the window shows a
 * generic placeholder icon no matter what the app sets internally.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIST_DIR = path.join(DESKTOP_DIR, "dist");
const ICON_SOURCE = path.join(DESKTOP_DIR, "icon.png");

// must match APP_ID in main.js, or the compositor cannot pair window to entry
const APP_ID = "excalidraw-desktop";

const HOME = os.homedir();
const APPLICATIONS_DIR = path.join(HOME, ".local", "share", "applications");
const ICON_DIR = path.join(
  HOME,
  ".local",
  "share",
  "icons",
  "hicolor",
  "512x512",
  "apps",
);

const findAppImage = async () => {
  const fromArg = process.argv[2];
  if (fromArg) {
    return path.resolve(fromArg);
  }
  const entries = await fs.readdir(DIST_DIR).catch(() => []);
  const appImages = entries.filter((name) => name.endsWith(".AppImage"));
  if (appImages.length === 0) {
    console.error(
      [
        `No .AppImage found in ${DIST_DIR}`,
        "",
        "Build one first:",
        "  yarn --cwd desktop dist",
        "",
        "Or pass an explicit path:",
        "  node scripts/install-desktop-entry.mjs /path/to/App.AppImage",
      ].join("\n"),
    );
    process.exit(1);
  }
  return path.join(DIST_DIR, appImages.sort().at(-1));
};

const run = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });

const appImage = await findAppImage();

// the launcher must be executable or the entry silently does nothing
await fs.chmod(appImage, 0o755).catch(() => {});

await fs.mkdir(APPLICATIONS_DIR, { recursive: true });
await fs.mkdir(ICON_DIR, { recursive: true });
await fs.copyFile(ICON_SOURCE, path.join(ICON_DIR, `${APP_ID}.png`));

// Exec paths with spaces have to be quoted; %U lets the entry accept file args.
// The display flags are passed here so a menu launch lands on Wayland with the
// right app_id directly, without main.js having to relaunch itself.
const entry = `[Desktop Entry]
Type=Application
Name=Excalidraw Desktop
Comment=Whiteboard with shape icons, auto-palette and image labels
Exec="${appImage}" --ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --class=${APP_ID} %U
Icon=${APP_ID}
Terminal=false
Categories=Graphics;
StartupNotify=true
StartupWMClass=${APP_ID}
`;

const entryPath = path.join(APPLICATIONS_DIR, `${APP_ID}.desktop`);
await fs.writeFile(entryPath, entry, "utf8");
await fs.chmod(entryPath, 0o755);

// refresh caches so the icon appears without a logout; all optional
await run("update-desktop-database", [APPLICATIONS_DIR]);
await run("gtk-update-icon-cache", [
  "-f",
  "-t",
  path.join(HOME, ".local", "share", "icons", "hicolor"),
]);
await run("kbuildsycoca6", ["--noincremental"]);

console.log(`installed ${entryPath}`);
console.log(`  launcher: ${appImage}`);
console.log(`  icon:     ${path.join(ICON_DIR, `${APP_ID}.png`)}`);
console.log(`  app_id:   ${APP_ID}`);
