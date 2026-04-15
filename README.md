# Webster

Webster is a Photoshop-like web image editor built with Next.js, React, TypeScript, and raw WebGL rendering.

## Workspace

```text
webster/
  apps/
    web/        Next.js + React + TypeScript editor frontend
    api/        Reserved for a future backend; not implemented yet
  packages/
    shared/     Shared TypeScript contracts
  docker/       Reserved for deployment files; Docker config is not implemented yet
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

Open the app at:

```text
http://localhost:3000
```

Build everything:

```bash
npm run build
```

Build only the web app:

```bash
npm run build:web
```

Type-check everything:

```bash
npm run typecheck
```

## Current Status

Legend:

- Present: implemented in the app
- Partial: implemented, but not complete enough for a full product/demo requirement
- Planned: not implemented yet

| Area | Status | Notes |
| --- | --- | --- |
| Editor workspace | Present | Toolbar, tool rail, tabs, WebGL canvas, layers, properties, and history panels exist. |
| Project templates/presets | Partial | New document presets exist: 1200x800, 1920x1080, 1080x1080. User-created templates are planned. |
| New project creation | Present | New document dialog creates a blank document from preset/custom size. |
| WebGL rendering | Present | Scene rendering is outside React and handled by `Renderer`. |
| Layers | Present | Shape and image layers are supported. |
| Add images | Present | Image import creates an image layer. |
| Move elements by mouse | Present | Move tool can select, move, resize, and rotate layers. |
| Move elements by keyboard | Planned | Arrow-key nudging is not implemented yet. |
| Delete elements | Present | Layer menu supports deleting layers. |
| Canvas pan | Present | Pan tool and middle mouse panning are supported. |
| Canvas zoom | Present | Mouse wheel zoom is supported. Dedicated Zoom tool was removed because wheel zoom already covers it. |
| Canvas resize | Partial | New documents can be created at chosen sizes. Resizing an existing canvas is planned. |
| Selection tools | Present | Rectangle Select and Ellipse Select are implemented. |
| Selection placeholders | Planned | Lasso Select and Magic Select are visible as disabled "Later" tools. |
| Selection overlay | Present | Active selections dim the outside area and show a moving dashed outline. |
| Clear selection | Present | Select menu supports clearing the current selection. |
| Invert selection | Present | Select menu supports inverted selections. |
| Selection to mask | Present | Selection can be rasterized into the selected layer mask. |
| Brush inside selection | Present | Mask Brush respects the active selection. |
| Mask brush | Present | Paints reveal/hide values into layer masks with size, opacity, and mode controls. |
| Free drawing / pencil | Planned | General paint/pencil drawing is not implemented yet. |
| Text tool | Planned | Text creation, text color, size, and font/style controls are not implemented yet. |
| Shape elements | Partial | Rectangle-like shape layer exists. Triangle, arrows, custom shape library, and shape insertion UI are planned. |
| History panel | Partial | Panel exists, but full undo/redo history is not implemented. Mask brush stroke undo exists. |
| Save `.webster` | Present | Saves a portable project package with `manifest.json` and image assets. |
| Open `.webster` | Present | Opens saved Webster project packages. |
| Recent project handle | Present | Uses browser File System Access API/IndexedDB when available. |
| Export PNG | Present | `File -> Export as... -> PNG`; transparent background, no editor UI/tools in output. |
| Export JPEG/JPG | Present | `File -> Export as... -> JPEG`; white or checkerboard background, no editor UI/tools in output. |
| Export PDF | Present | `File -> Export as... -> PDF`; single-page PDF with white or checkerboard background, no editor UI/tools in output. |
| Extra export format | Present | `.webster` project package is the extra native project format. |
| Social sharing | Planned | Sharing to social networks is not implemented yet. |
| Authentication | Planned | Registration, login, email confirmation, and profile editing are not implemented. |
| Backend API | Planned | `apps/api` is reserved but currently empty. |
| Database | Planned | No server database is currently used. |
| Hosted domain | Planned | No production domain is configured in this repository. |
| Docker deployment | Planned | Dockerfile and docker-compose.yml are not implemented yet. |

## Tools

The tool rail intentionally shows only tools that are useful right now, plus disabled placeholders for future selection tools.

| Tool | Status | Description |
| --- | --- | --- |
| Move | Present | Select, move, resize, and rotate layers. |
| Pan | Present | Drag the workspace without editing artwork. |
| Mask Brush | Present | Paint the selected layer mask. |
| Rectangle Select | Present | Drag a rectangular selection. Previously called Marquee. |
| Ellipse Select | Present | Drag an oval selection. |
| Lasso Select | Planned | Disabled placeholder for freehand selection. |
| Magic Select | Planned | Disabled placeholder for color/similarity-based selection. |

Removed from the active tool list:

- Brush: planned as a future free drawing tool.
- Eraser: planned after general pixel/paint layers exist.
- Text: planned after text layer support exists.
- Zoom: removed because wheel zoom is already implemented.

## Keyboard And Mouse Controls

| Control | Status | Action |
| --- | --- | --- |
| Ctrl+S / Cmd+S | Present | Save current `.webster` project. |
| Ctrl+Z / Cmd+Z | Partial | Undo last Mask Brush stroke only. Full history undo is planned. |
| Mouse wheel | Present | Zoom canvas at pointer position. |
| Middle mouse drag | Present | Pan canvas. |
| Pan tool + drag | Present | Pan canvas. |
| Move tool + drag layer | Present | Move selected layer with mouse. |
| Transform handles | Present | Resize and rotate selected layer with mouse. |
| Ctrl+C / Cmd+C | Planned | Copy selected layer or selected area. Selection-area copy is not implemented yet. |
| Ctrl+V / Cmd+V | Planned | Paste copied layer/area. |
| Delete / Backspace | Planned | Delete selected layer from keyboard. Layer menu delete exists. |
| Arrow keys | Planned | Nudge selected layer or selection. |
| Ctrl+Plus / Ctrl+Minus | Planned | Keyboard zoom shortcuts. |
| Escape | Planned | Cancel/clear selection or active input. |

## Export Behavior

Image/PDF export renders the artwork through an offscreen WebGL canvas. It does not capture the visible editor viewport.

Export output excludes:

- selection dim overlay
- marching-ants outline
- selected layer outline
- transform handles
- cursors
- rulers, panels, tabs, toolbar, or any editor UI

Formats:

- PNG: transparent background.
- JPEG/JPG: white or checkerboard background.
- PDF: single-page PDF, white or checkerboard background.
- `.webster`: native editable project package.

## Project Format

`.webster` files are ZIP-like packages containing:

- `manifest.json`
- image assets referenced by image layers

Current project data includes:

- document bounds and background metadata
- layer order
- selected layer id
- shape layers
- image layers
- layer masks
- transforms: x, y, width, height, scale, rotation
- visibility, opacity, lock state

## Database

Current state: no server database is used.

Why: the current implementation is a client-only editor. Projects are saved locally as `.webster` files, and recent file handles are remembered in the browser through IndexedDB/File System Access API support.

Planned production choice: PostgreSQL.

Why PostgreSQL is a good fit later:

- user accounts and profiles
- project ownership
- template ownership
- save history/revisions
- sharing permissions
- subscription/billing metadata if needed
- reliable relational constraints for collaborative/project data

The likely future stack is:

```text
Next.js frontend -> backend API -> PostgreSQL
```

## Docker And Hosting

Current state: Docker deployment is not implemented.

Missing files:

```text
Dockerfile
docker-compose.yml
```

The `docker/` directory currently only contains `.gitkeep`.

Before a hosting/demo requirement can be satisfied, add deployment files such as:

```dockerfile
# Dockerfile - planned example
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

```yaml
# docker-compose.yml - planned example
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
```

Expected demo commands after Docker files are added:

```bash
docker compose build
docker compose up
```

Hosting/domain status:

- Production hosting is not configured in this repository.
- No deployed domain is documented yet.

## Course/Demo Checklist

This section maps the expected demo requirements to current project status.

| Requirement | Status | Notes |
| --- | --- | --- |
| Show Dockerfile/docker-compose deployment config | Planned | Docker config is not present yet. |
| Show project build logs | Partial | Local `npm run build:web` works. Docker build logs are not available until Docker config is added. |
| App works on hosting by domain name | Planned | No hosted domain is configured. |
| Explain database choice | Partial | No DB currently; PostgreSQL is the planned production choice. |
| Go to app homepage | Present | Local homepage runs at `http://localhost:3000`. |
| User registration | Planned | No auth backend/UI yet. |
| User login | Planned | No auth backend/UI yet. |
| Email confirmation | Planned | No email/auth flow yet. |
| Modify user profile | Planned | No user profile system yet. |
| Project templates | Partial | Built-in document presets exist. User templates are planned. |
| Create new project | Present | New document dialog exists. |
| Add/work with text | Planned | Text tool/layers are not implemented. |
| Free drawing/pencil | Planned | General drawing tool is not implemented. |
| Shape elements | Partial | Basic shape layer exists; more shapes and insertion UI are planned. |
| Add pictures as elements | Present | Import image as layer works. |
| Move elements with mouse | Present | Move tool works. |
| Move elements with keyboard | Planned | Arrow-key movement is not implemented. |
| Delete elements from canvas | Present | Layer menu delete exists. Keyboard delete is planned. |
| Change history and restore previous version | Partial | History panel exists; full undo/revision restore is planned. |
| Resize canvas | Partial | New document size exists; resizing an existing document is planned. |
| Zoom canvas | Present | Mouse wheel zoom works. |
| Save project as JPG | Present | Export as JPEG. |
| Save project as PNG | Present | Export as transparent PNG. |
| Save project as PDF | Present | Export as single-page PDF. |
| Save project in additional format | Present | `.webster` native project format. |
| Share in social networks | Planned | Not implemented. |
| User-created templates | Planned | Not implemented. |

## Planned Improvements

### Save Performance

Saving is correct but heavy. Each save rebuilds the full `.webster` package, including image assets, even when only metadata changed.

Planned:

- cache exported image asset blobs by `assetId`
- rebuild only changed entries when possible
- avoid re-reading unchanged image data on every save
- show progress for large project saves

### Background Saving

Packaging should move into a Web Worker so the UI stays responsive during large saves.

Planned:

- move `.webster` package creation off the main thread
- report save progress back to the toolbar
- keep `Saving...`, `Saved`, and `Save failed` labels connected to worker state

### Full History

Current undo only covers the last Mask Brush stroke.

Planned:

- command-based undo/redo
- layer create/delete history
- transform history
- mask edit history
- project revision restore

### Auth, Cloud Save, And Templates

Planned:

- backend API
- PostgreSQL database
- registration/login/email confirmation
- user profile editing
- cloud project ownership
- project sharing
- user-created templates
