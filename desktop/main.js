const { app, BrowserWindow, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * The renderer is the built web app, copied in by scripts/sync-renderer.mjs.
 * It is served over a custom scheme rather than file:// because the Vite build
 * emits absolute asset paths ("/assets/..."), which file:// cannot resolve, and
 * because a real origin keeps localStorage (where drawings live) stable.
 */
const RENDERER_DIR = path.join(__dirname, "renderer");
const ICON_PATH = path.join(__dirname, "icon.png");
const SCHEME = "excalidraw";
const ORIGIN = `${SCHEME}://app`;
const SMOKE_TEST = process.argv.includes("--smoke");

/**
 * Identifies the window to the desktop environment. Wayland compositors match
 * a window's app_id against an installed .desktop file to find its icon, so
 * this has to agree with StartupWMClass in the desktop entry (see
 * scripts/install-desktop-entry.mjs) or the window falls back to a generic
 * icon.
 */
const APP_ID = "excalidraw-desktop";

/**
 * Chromium picks its Ozone platform and window class before this file runs, so
 * app.commandLine.appendSwitch() is too late and silently does nothing — the
 * window comes up on XWayland with class "excalidraw desktop", which matches no
 * desktop entry, which is why the icon falls back to a generic one. The flags
 * only work as real argv.
 *
 * "executableArgs" in package.json puts them in the packaged desktop entry, but
 * running the AppImage directly bypasses that and execs the binary bare, so we
 * relaunch ourselves once with the flags attached.
 */
const LINUX_DISPLAY_FLAGS = [
  "--ozone-platform-hint=auto",
  "--enable-features=WaylandWindowDecorations",
];

// Verified on KDE/Wayland: --class is IGNORED by Electron. It derives the X11
// WM_CLASS from the app name, so passing --class=excalidraw-desktop still
// produced WM_CLASS "Excalidraw Desktop". CHROME_DESKTOP (below) is what
// actually sets the Wayland app_id, and that is what makes the icon resolve.
//
// Do NOT call app.setName() to force the app_id instead: the app name also
// determines Electron's userData directory, so renaming it silently moves the
// profile and the user's saved drawings appear to vanish.

/**
 * --class only sets the X11 WM_CLASS. On Wayland, Chromium derives the
 * xdg_toplevel app_id from its "desktop name", which it reads from the
 * CHROME_DESKTOP environment variable — so without this the Wayland window
 * carries a default app_id, matches no desktop entry, and shows a generic icon
 * even though the entry and hicolor icon are installed correctly.
 */
const DESKTOP_FILE = `${APP_ID}.desktop`;
if (process.platform === "linux" && !process.env.CHROME_DESKTOP) {
  process.env.CHROME_DESKTOP = DESKTOP_FILE;
}

const RELAUNCH_GUARD = "EXCALIDRAW_DESKTOP_RELAUNCHED";

const needsWaylandRelaunch =
  process.platform === "linux" &&
  !!process.env.WAYLAND_DISPLAY &&
  !process.env[RELAUNCH_GUARD] &&
  // the smoke test passes the flags itself and needs to own the exit code
  !SMOKE_TEST &&
  !process.argv.some((arg) => arg.startsWith("--ozone-platform"));

if (needsWaylandRelaunch) {
  require("node:child_process")
    .spawn(process.execPath, [...process.argv.slice(1), ...LINUX_DISPLAY_FLAGS], {
      detached: true,
      stdio: "inherit",
      env: {
        ...process.env,
        [RELAUNCH_GUARD]: "1",
        CHROME_DESKTOP: DESKTOP_FILE,
      },
    })
    .unref();
  app.exit(0);
  // CommonJS wraps modules in a function, so this stops the rest from running
  return;
}

const MIME_TYPES = new Map(
  Object.entries({
    ".css": "text/css",
    ".html": "text/html",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".json": "application/json",
    ".map": "application/json",
    ".mjs": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".txt": "text/plain",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "application/xml",
  }),
);

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const readRendererFile = async (pathname) => {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const resolved = path.resolve(RENDERER_DIR, relative);

  // never serve anything outside the renderer directory
  if (resolved !== RENDERER_DIR && !resolved.startsWith(RENDERER_DIR + path.sep)) {
    return null;
  }

  try {
    const stats = await fs.stat(resolved);
    if (stats.isFile()) {
      return { file: resolved, body: await fs.readFile(resolved) };
    }
  } catch {
    // falls through to the SPA fallback below
  }
  return null;
};

const serveRenderer = async (request) => {
  const { pathname } = new URL(request.url);

  const hit =
    (await readRendererFile(pathname)) ??
    // SPA fallback: unknown paths render the app shell
    (await readRendererFile("/index.html"));

  if (!hit) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  }

  const type = MIME_TYPES.get(path.extname(hit.file).toLowerCase());
  return new Response(hit.body, {
    status: 200,
    headers: type ? { "content-type": type } : {},
  });
};

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    show: !SMOKE_TEST,
    // used by X11/XWayland directly; on Wayland the icon comes from the
    // matching desktop entry instead
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // the app is local; anything else belongs in the user's real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
      }
    }
  });

  await win.loadURL(`${ORIGIN}/index.html`);
  return win;
};

/** Loads the app and asserts the canvas actually rendered, then exits. */
const runSmokeTest = async (win) => {
  const probe = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(".excalidraw__canvas");
      return {
        title: document.title,
        hasExcalidrawRoot: !!document.querySelector(".excalidraw"),
        canvasCount: document.querySelectorAll(".excalidraw__canvas").length,
        canvasWidth: canvas ? canvas.width : 0,
      };
    })()
  `);

  const ok =
    probe.hasExcalidrawRoot && probe.canvasCount > 0 && probe.canvasWidth > 0;

  // NOTE: no Wayland-vs-X11 probe here on purpose. Unix domain socket fds do
  // not expose their peer path, so /proc/self/fd cannot tell the two apart, and
  // an earlier attempt at it reported plausible-looking nonsense. To check the
  // backend, look for the app in the X client list instead (see README) — a
  // native Wayland window does not appear there at all.
  console.log(`smoke: ${JSON.stringify(probe)}`);
  console.log(ok ? "smoke: PASS" : "smoke: FAIL");
  app.exit(ok ? 0 : 1);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      win.isMinimized() && win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    protocol.handle(SCHEME, serveRenderer);

    const win = await createWindow();

    if (SMOKE_TEST) {
      // give the editor a moment to mount its canvases
      setTimeout(() => runSmokeTest(win), 3000);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
