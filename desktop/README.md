# Excalidraw Desktop

An Electron shell around this fork's web build, so the editor runs as a normal
desktop app instead of a dev server.

Electron bundles Chromium, so what renders here is the same engine the features
were built and verified against.

## One-time setup

```bash
yarn --cwd desktop install
```

This is kept out of the root yarn workspaces on purpose: it pulls a ~100 MB
Electron binary, which nobody working only on the web app should have to
download.

## Run it

From the repo root:

```bash
yarn build:app:docker && yarn --cwd desktop start
```

`build:app:docker` produces the web build with Sentry disabled (and
`.env.production` already sets `VITE_APP_ENABLE_TRACKING=false`).
`desktop start` copies that build into `desktop/renderer/` and launches it.

## Build an installable app

```bash
yarn --cwd desktop dist
```

Output lands in `desktop/dist/` as an `AppImage` — make it executable and
double-click it, no install step:

```bash
chmod +x "desktop/dist/Excalidraw Desktop-1.0.0.AppImage"
```

`mac` (dmg) and `win` (nsis) targets are configured too, but each has to be
built on that platform.

**No rpm/deb target.** electron-builder bundles fpm 1.9.3 (2015), and the spec
files it generates are rejected by RPM 6 shipped in Fedora 43 — `rpmbuild`
exits 1. The AppImage is unaffected. To get an rpm you'd need a newer fpm than
the bundled one.

## Desktop integration (icon + Wayland)

An AppImage is just a file, so nothing tells the desktop what it is called or
which icon to use. Register it once:

```bash
yarn --cwd desktop install-entry
```

That writes `~/.local/share/applications/excalidraw-desktop.desktop` and a
512x512 icon into `~/.local/share/icons/hicolor`, then refreshes the icon
caches. Re-run it if you move the AppImage.

### Why the icon needs this

Wayland compositors resolve a window's icon by matching its `app_id` against an
installed desktop entry. Three things have to agree, or you get a generic
placeholder icon:

- the window's `app_id` — set by `--class=excalidraw-desktop`
- `StartupWMClass` in the desktop entry
- the desktop entry's filename

### Why the flags are passed as argv

Chromium chooses its Ozone platform and window class before `main.js` runs, so
`app.commandLine.appendSwitch()` is too late and does nothing. Without real
argv the app lands on XWayland with class `"excalidraw desktop"` (note the
space), which matches no desktop entry — that was the original generic-icon
bug. The flags reach the app three ways: `executableArgs` (packaged desktop
entry), the installed entry's `Exec` line, and a one-time self-relaunch in
`main.js` for when the AppImage is run directly.

### Checking which backend it actually used

A native Wayland window is not an X client, so it never appears in the X client
list. With the app running:

```bash
for w in $(xprop -root _NET_CLIENT_LIST | grep -oE "0x[0-9a-f]+"); do xprop -id $w WM_CLASS; done | grep -i excalidraw
```

No output means native Wayland. A `WM_CLASS` line means it fell back to
XWayland.

## Smoke test

```bash
yarn --cwd desktop smoke
```

Loads the app in a hidden window, asserts the Excalidraw canvas actually
mounted with a non-zero size, prints `smoke: PASS`/`FAIL` and exits with a
matching code.

## How it works

`main.js` serves `desktop/renderer/` over a custom `excalidraw://app` scheme
rather than `file://`. Two reasons:

- the Vite build emits absolute asset paths (`/assets/...`), which `file://`
  cannot resolve;
- a stable origin keeps `localStorage` intact, which is where your drawings
  are saved.

Files are read with `fs` (asar-aware) and returned with an explicit MIME type.
Paths are resolved and checked to stay inside `renderer/`. The renderer runs
sandboxed with `contextIsolation` on and `nodeIntegration` off, and any
`http(s)` navigation is handed to the system browser instead of opening in-app.

## Notes

- Drawings persist in `localStorage`, scoped to the app's own origin — separate
  from whatever you have in a browser.
- The "Live collaboration" button still points at Excalidraw's public collab
  server. Only used if you click it; remove the UI if you want it fully
  offline.
- `renderer/`, `dist/`, `icon.png` and `node_modules/` are generated — all
  git-ignored.
