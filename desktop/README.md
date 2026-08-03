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
