# Electron (Desktop)

This folder contains the Electron entrypoints for packaging Matheshop as a desktop app.

- `main.cjs`: Electron main process (creates the BrowserWindow)
- `preload.cjs`: preload script (safe bridge APIs via `contextBridge`)

## Dev

The desktop app loads the Vite dev server.

- Start: `pnpm desktop:dev`

It runs Vite + Electron together.

## Build

- Build web assets: `pnpm build`
- Package desktop apps: `pnpm desktop:dist`

Artifacts will be in `dist-desktop/`.

