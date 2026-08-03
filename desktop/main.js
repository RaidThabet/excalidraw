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
const SCHEME = "excalidraw";
const ORIGIN = `${SCHEME}://app`;
const SMOKE_TEST = process.argv.includes("--smoke");

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
