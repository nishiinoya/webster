# Webster

A Photoshop-like web image editor

## Workspace

```text
webster/
  apps/
    web/      Next.js + React + TypeScript frontend
    api/      Reserved for a future NestJS backend
  packages/
    shared/   Shared TypeScript contracts
  docker/     Future Docker files
```

## Commands

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev:web
```

Open the app at `http://localhost:3000`.

The `apps/api` folder is intentionally empty for now. Backend commands will be added later, when the NestJS app is introduced.

Build everything:

```bash
npm run build
```

Type-check everything:

```bash
npm run typecheck
```

## Current Editor State

The frontend editor currently has:

- editor workspace layout with toolbar, tools, tabs, canvas, layers, properties, and history panels
- raw WebGL rendering kept outside React components
- camera zoom and pan
- shape and image layers
- layer selection, move, resize, and rotate controls
- `.webster` project files built as a ZIP-like package with `manifest.json` plus image assets
- `Save`, `Save as .webster...`, `Open .webster...`, and `Ctrl+S`
- remembered file handles in supported browsers through IndexedDB and the File System Access API

## Needed Updates

### Save Performance

Saving is currently correct but heavy. Each save rebuilds the full `.webster` package, including image asset entries, even when only layer metadata changed.

Planned improvements:

- cache exported image asset blobs by `assetId`
- only rebuild changed entries when possible
- avoid re-reading unchanged image data on every save
- keep image assets stable and update `manifest.json` for common layer edits
- show progress for larger project saves

### Background Saving

Packaging should move into a Web Worker so the UI stays responsive during large saves.

Planned improvements:

- move `.webster` package creation off the main thread
- send scene JSON and asset references to the worker
- report save progress back to the toolbar
- keep `Saving...`, `Saved`, and `Save failed` labels connected to worker state

### Compression

The current `.webster` writer stores ZIP entries uncompressed. This keeps the first implementation simple, but project files can be larger than needed.

Planned improvements:

- add ZIP compression support, likely DEFLATE
- compress JSON and other text entries
- decide whether image assets should be compressed, because PNG/JPEG/WebP are already compressed
- keep backward compatibility with uncompressed `.webster` files
- consider using a proven ZIP library once project packaging grows beyond the current simple writer

### Project Format

The `.webster` format should stay flexible as new layer types are added.

Planned improvements:

- version every project manifest
- keep layer JSON type-based, for example `shape`, `image`, `text`, and future `mask`
- store binary assets separately from layer metadata
- avoid breaking old files when masks, text, effects, or adjustment layers are introduced

### Cloud Save

The local `.webster` file flow should later map cleanly to cloud storage for subscriptions.

Planned improvements:

- upload binary assets once and reuse them by asset ID
- save scene changes as JSON metadata updates
- add project ownership and authentication on the backend
- support autosave and revision history
- keep local `.webster` export/import as a portable backup format
