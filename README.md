# Webster

Webster is a Photoshop-like web image editor built with Next.js, React, TypeScript, and raw WebGL rendering. It supports fully local editing with portable `.webster` files, plus a frontend collaboration layer for shared-project mode.

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

Optional shared-editing frontend configuration:

```bash
NEXT_PUBLIC_WEBSTER_API_URL=http://localhost:4000/api
NEXT_PUBLIC_WEBSTER_WS_URL=ws://localhost:4000/ws/projects/{projectId}
```

If these are not set, the frontend assumes REST routes under `/api` and WebSocket rooms under `/ws/projects/:projectId`. The backend is not implemented in this repository yet.

## Current Status

Legend:

- Present: implemented in the app.
- Partial: implemented, but still has known limitations.
- Planned: not implemented yet.

| Area | Status | Notes |
| --- | --- | --- |
| Editor workspace | Present | Top menus, tool rail, tabs, WebGL canvas, layers, properties, and history panels exist. |
| Top menus | Partial | File/Edit/Layer/View/Filter/Select expose the main editor commands. A few advanced view/filter entries remain future work. |
| Project templates/presets | Present | Built-in document presets and user-created `.webster` templates exist. |
| New project creation | Present | New document dialog creates a blank document from preset/custom size. |
| WebGL rendering | Present | Scene rendering is outside React and handled by `Renderer`. |
| Layers | Present | Image, text, shape, stroke, and adjustment layers are supported. |
| Layer properties | Present | Transform, visibility, lock, opacity, text, shape, mask, and filter controls exist. |
| Adjustment layers | Partial | Adjustment layers affect layers below and can be moved/scaled to limit the affected rectangular region. Rotated adjustment layers currently use their world bounding box. |
| Per-layer filters | Present | Brightness, contrast, saturation, grayscale, hue, sepia, invert, shadow, blur, and drop shadow settings exist. |
| Shader filter rendering | Partial | Basic filters are shader uniforms. Adjustment-layer blur now uses an offscreen framebuffer/post-process pass over the composited scene. Per-layer vector/text/brush blur is still edge softness. |
| Drop shadow | Partial | Drop shadow is rendered as GPU passes behind the layer. It is useful but not a full Photoshop-style shadow renderer yet. |
| Add images | Present | Image import creates an image layer. |
| Move elements by mouse | Present | Move tool can select, move, resize, and rotate layers. |
| Move elements by keyboard | Present | Arrow-key nudging is implemented. |
| Delete elements | Present | Layer menu and keyboard delete/backspace can remove layers. |
| Canvas pan | Present | Pan tool and middle mouse panning are supported. |
| Canvas zoom | Present | Mouse wheel zoom is supported. Dedicated Zoom tool was removed because wheel zoom already covers it. |
| Canvas resize | Present | New documents can be created at chosen sizes and existing canvases can be resized. |
| Selection tools | Present | Rectangle, ellipse, lasso, and magic/similarity selection tools are available. |
| Selection overlay | Present | Active selections dim the outside area and show a moving dashed outline. |
| Clear selection | Present | Select menu supports clearing the current selection. |
| Invert selection | Present | Select menu supports inverted selections. |
| Selection to mask | Present | Selection can be rasterized into the selected layer mask. |
| Draw inside selection | Present | Draw strokes respect rectangle/ellipse selections. Selection clips are stored on stroke paths so changing selection later does not reveal hidden parts. |
| Mask brush | Present | Paints reveal/hide values into layer masks with size, opacity, and mode controls. Mask brush resolution is increased for better quality. |
| Free drawing | Present | Draw tool supports pencil, pen, brush, marker, highlighter, color, size, eraser mode, and target stroke layer selection. |
| Stroke layers | Present | Multiple paths with different style/color/size can live on one stroke layer. Drawing can continue into an existing stroke layer. |
| Text tool | Present | Text creation, editing, selection, color, size, font, alignment, bold, and italic controls exist. |
| Shape elements | Present | Rectangle, circle, line, triangle, diamond, and arrow shapes exist with fill/stroke controls. |
| History panel | Present | Command history records editor actions and supports undo/redo summaries. |
| Save `.webster` | Present | Saves a portable project package with `manifest.json` and image assets. |
| Open `.webster` | Present | Opens saved Webster project packages. |
| Recent project handle | Present | Uses browser File System Access API/IndexedDB when available. |
| Local mode | Present | Editor works without a server. Users can create projects, edit locally, open/save `.webster`, and export files. |
| Shared mode frontend | Partial | Frontend can load a shared project over REST, hydrate the editor from the existing `.webster` manifest shape, connect to WebSocket, join a project room, and send/receive collaboration events. Requires a backend to be useful. |
| Share project frontend | Partial | `File -> Share project...` exports the current local project as a normal `.webster` Blob and uploads it through REST. Backend decomposition/storage is not implemented here. |
| Shared project download frontend | Partial | Shared projects can request a backend-packed `.webster` export through REST. Backend packing is not implemented here. |
| Realtime operations frontend | Partial | Local editor history actions become commit operations; pointer gestures can send preview operations; remote applied operations hydrate the local scene. Backend persistence/broadcast is not implemented here. |
| Shared asset upload frontend | Partial | New shared-mode image assets, selected-pixel edits, image resampling results, fonts, textures, and 3D model assets upload through REST before socket operations are sent. Requires backend asset routes. |
| Pending collaboration queue | Present | Unconfirmed commit operations are queued with `clientOperationId` and resent after reconnect. |
| Shared roles frontend | Present | Shared types define owner/editor/viewer roles. Viewer mode disables editing controls while still allowing project viewing and remote updates. |
| Presence frontend | Partial | Connection status and online users can be shown when backend presence events are available. Cursor/tool payloads are sent from the frontend. |
| Version history frontend | Partial | A Versions panel lists snapshots/checkpoints, creates manual snapshot requests, restores snapshots by request, refreshes history, and downloads `.webster` when permitted. Backend snapshot APIs are not implemented here. |
| Export PNG | Present | `File -> Export as... -> PNG`; transparent background option, no editor UI/tools in output. |
| Export JPEG/JPG | Present | `File -> Export as... -> JPEG`; white or checkerboard background, no editor UI/tools in output. |
| Export PDF | Present | `File -> Export as... -> PDF`; single-page PDF with white or checkerboard background, no editor UI/tools in output. |
| Export color consistency | Partial | Export path uses WebGL offscreen rendering; color issues have been worked on, but more browser/device validation is still useful. |
| Extra export format | Present | `.webster` project package is the extra native project format. |
| Social sharing | Planned | Sharing to social networks is not implemented yet. Project sharing frontend is for shared editing, not social-network posting. |
| Authentication | Planned | Registration, login, email confirmation, and profile editing are not implemented. |
| Backend API | Planned | `apps/api` is reserved but currently empty. |
| Database | Planned | No server database is currently used. |
| Hosted domain | Planned | No production domain is configured in this repository. |
| Docker deployment | Planned | Dockerfile and docker-compose.yml are not implemented yet. |

## Tools

The tool rail shows the active editor tools available for the current document. In shared viewer mode, editing tools are disabled while viewing, pan, presence, and remote updates remain available.

| Tool | Status | Description |
| --- | --- | --- |
| Move | Present | Select, move, resize, and rotate layers. |
| Pan | Present | Drag the workspace without editing artwork. |
| Mask Brush | Present | Paint the selected layer mask. |
| Text | Present | Place and edit live text layers. |
| Draw | Present | Draw freehand strokes with pencil, pen, brush, marker, and highlighter. |
| Shape | Present | Draw rectangles, circles, lines, triangles, diamonds, and arrows. |
| Rectangle Select | Present | Drag a rectangular selection. |
| Ellipse Select | Present | Drag an oval selection. |
| Lasso Select | Present | Draw a freehand selection. |
| Magic Select | Present | Pick similar image colors. |

Removed from the active tool list:

- Zoom: removed because wheel zoom is already implemented.

## Top Menus

| Menu | Status | Notes |
| --- | --- | --- |
| File | Present | New, open `.webster`, open shared project, import image/font, save local `.webster`, share project through REST, save/export templates, export image/PDF, download shared `.webster`, and open Version History. Backend-backed shared actions require backend routes. |
| Edit | Present | Undo/redo, duplicate/delete/group, cut/copy/paste, layer ordering, and image-layer actions are available where applicable. |
| View | Partial | Current zoom/canvas size display, canvas resize, canvas border toggle, and Pan workspace action exist. Fit canvas, keyboard zoom, checkerboard toggle, rulers, and guides remain future work. |
| Filter | Partial | Can add an adjustment layer. Implemented filter families are listed. Filter gallery and clipping adjustment to one layer/group are TODO. |
| Select | Present | Clear selection, invert selection, and convert selection to mask. |

## Keyboard And Mouse Controls

| Control | Status | Action |
| --- | --- | --- |
| Ctrl+S / Cmd+S | Present | Save current `.webster` project. |
| Ctrl+Z / Cmd+Z | Present | Undo the latest recorded editor action. |
| Mouse wheel | Present | Zoom canvas at pointer position. |
| Middle mouse drag | Present | Pan canvas. |
| Pan tool + drag | Present | Pan canvas. |
| Move tool + drag layer | Present | Move selected layer with mouse. |
| Transform handles | Present | Resize and rotate selected layer with mouse. |
| Text keyboard input | Present | Typing, caret movement, selection, copy/paste text input, delete/backspace, and multiline text editing exist while editing text. |
| Ctrl+C / Cmd+C | Present | Copy selected layer content or selected pixels when available. |
| Ctrl+V / Cmd+V | Present | Paste copied layer/pixel content when available. |
| Delete / Backspace | Present | Delete selected layer from keyboard. |
| Arrow keys | Present | Nudge the selected layer. Shift nudges by a larger step. |
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

- PNG: transparent, white, or checkerboard background depending on export option.
- JPEG/JPG: white or checkerboard background.
- PDF: single-page PDF, white or checkerboard background.
- `.webster`: native editable project package.

## Project Format

`.webster` files are ZIP-like packages containing:

- `manifest.json`
- image assets referenced by image layers
- original image assets when a layer has working pixel changes
- font assets referenced by the manifest
- imported 3D model packages/textures when 3D layers are present

Current project data includes:

- document bounds and background metadata
- layer order
- selected layer id
- image layers
- text layers
- shape layers
- stroke layers and per-path brush settings
- adjustment layers
- layer masks
- selection clips stored on stroke paths
- font asset metadata
- 3D layer/model/material metadata when used
- transforms: x, y, width, height, scale, rotation
- visibility, opacity, lock state
- per-layer filter settings

## Shared Editing Frontend

Shared editing is frontend-only in this repository. No backend, database, Redis, server storage, backend auth, or server WebSocket logic has been added.

The frontend supports two modes:

- Local mode: current client-only editor behavior. `.webster` open/save/export works without a server.
- Shared mode: project state is loaded from a backend snapshot, then realtime operations and presence use WebSocket.

The shared-project snapshot shape is based on the existing `.webster` manifest structure. The frontend does not invent a second project format.

REST is used for large/project-file work:

- upload local `.webster` when sharing a project
- load shared project snapshot/state
- download shared project as `.webster`
- upload/download assets when new images, selected-pixel edits, resampled image pixels, fonts, textures, or 3D model files are created in shared mode
- list/create/restore snapshots

WebSocket is used only for realtime collaboration:

- `project:join`
- `project:leave`
- `operation:preview`
- `operation:commit`
- `presence:cursor`
- receiving `project:state`
- receiving `operation:applied`
- receiving `operation:preview`
- receiving `presence:update`
- receiving `project:error`

Preview operations are temporary updates for drag/resize/rotate/drawing/mask/cursor movement. They are not saved and should not increase the project version.

Commit operations are autosaved edits. They include a `clientOperationId`, are held in a pending queue until backend confirmation, and are resent after reconnect so disconnected clients do not lose unconfirmed work.

For more detail, see [`docs/shared-editing-flow.md`](docs/shared-editing-flow.md).

## What Is Left To Implement

This is the practical remaining-work checklist.

### Core Editing

- More precise undo/redo merge behavior for long gestures and complex asset imports.
- More complete cut/copy/paste coverage for every selection/pixel workflow.
- Better layer ordering shortcuts from menus/keyboard.
- Crop document to selection.

### Selection

- More exact rotated adjustment/selection region handling where needed.
- More selection preview polish for complex lasso and magic-selection workflows.

### Filters And Effects

- Extend the offscreen framebuffer/post-process blur pipeline from adjustment-layer blur to exact per-layer blur workflows.
- More accurate soft drop shadow with blur spread instead of multi-pass approximation.
- Clip adjustment layer to one layer or group.
- Adjustment layer masks.
- Filter gallery/presets.
- Complex blur/sharpen after framebuffer support exists.
- Curves/levels/color balance/vibrance.
- Noise, posterize, threshold, and gradient map.

### Drawing And Brushes

- More natural brush engine with pressure/velocity if pointer hardware supports it.
- Brush presets saved in project/user settings.
- Stabilizer/smoothing control.
- Smudge/blend tool.
- Better eraser controls and keyboard shortcut.
- Optional raster paint layer mode if needed for very large drawings.

### Text

- Better font picker and font previews.
- Text box resizing behavior improvements.
- Text transform/warp effects.
- More text decorations: underline, stroke, shadow presets.
- Text layer export validation across browsers.

### Shapes

- More shape types: star, polygon, rounded rectangle, speech bubble.
- Editable shape points/handles.
- Shape presets.
- Gradient fill/stroke.

### View And UX

- Fit canvas command.
- Zoom in/out menu and keyboard shortcuts.
- Toggle checkerboard/document background preview.
- Rulers and guides.
- Snap to guides, canvas, and layers.
- Better status/error messages for failed saves/exports/imports.
- Improve mobile layout and touch interactions.

### Project, Save, And Export

- Incremental `.webster` saving so unchanged assets are not repackaged every time.
- Web Worker packaging for large project saves.
- Save progress for large files.
- More export color validation across browsers/GPUs.
- Export selected layer/selection only.
- Export scale/resolution controls.
- Multi-page or print-ready PDF options if needed.

### Backend, Accounts, And Sharing

- Backend API in `apps/api`.
- PostgreSQL schema.
- User registration.
- Login/logout.
- Email confirmation.
- User profile editing.
- Cloud project storage.
- Project ownership/permissions.
- Server-side shared project snapshots.
- Server-side operation persistence and replay.
- Server WebSocket rooms/broadcast.
- Backend asset storage for shared image/mask/model/texture assets.
- Backend permission checks for owner/editor/viewer roles.
- User-created templates.
- Project sharing links.
- Social sharing/export integration.

### Deployment

- Dockerfile.
- docker-compose.yml.
- Production hosting configuration.
- Environment variable documentation.
- Build/deploy logs for demo requirements.
- Public domain deployment.

### Nice-To-Have / Larger Ideas

- 3D object layer.
- Basic 3D primitives: cube, sphere, cylinder.
- 3D materials, color, and texture support.
- Plugin/filter architecture.
- Richer collaboration UI such as named cursor overlays, member management, comments, and snapshot previews.

## Database

Current state: no server database is used.

Why: the current implementation is still frontend-only. Projects can be saved locally as `.webster` files, and recent file handles are remembered in the browser through IndexedDB/File System Access API support. Shared-project UI and socket clients exist, but server persistence is not implemented here.

Planned production choice: PostgreSQL.

Why PostgreSQL is a good fit later:

- user accounts and profiles
- project ownership
- template ownership
- save history/revisions
- sharing permissions
- shared project operations
- shared project snapshots/checkpoints
- shared asset references
- subscription/billing metadata if needed
- reliable relational constraints for collaborative/project data

The likely future stack is:

```text
Next.js frontend -> backend API/WebSocket server -> PostgreSQL + asset storage
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
| Show project build logs | Partial | Local `npm run build:web` compiles. Docker build logs are not available until Docker config is added. |
| App works on hosting by domain name | Planned | No hosted domain is configured. |
| Explain database choice | Partial | No DB currently; PostgreSQL is the planned production choice. |
| Go to app homepage | Present | Local homepage runs at `http://localhost:3000`. |
| User registration | Planned | No auth backend/UI yet. |
| User login | Planned | No auth backend/UI yet. |
| Email confirmation | Planned | No email/auth flow yet. |
| Modify user profile | Planned | No user profile system yet. |
| Project templates | Present | Built-in document presets and user templates exist. |
| Create new project | Present | New document dialog exists. |
| Add/work with text | Present | Text tool/layers are implemented. |
| Free drawing/pencil | Present | Draw tool is implemented. |
| Shape elements | Present | Rectangle, circle, line, triangle, diamond, and arrow are implemented. |
| Add pictures as elements | Present | Import image as layer works. |
| Move elements with mouse | Present | Move tool works. |
| Move elements with keyboard | Present | Arrow-key nudging exists. |
| Delete elements from canvas | Present | Layer menu and keyboard delete exist. |
| Change history and restore previous version | Partial | Local history undo/redo exists. Shared snapshot restore UI exists, but backend-backed restore requires server support. |
| Resize canvas | Present | New document size exists; resizing an existing document is present. |
| Zoom canvas | Present | Mouse wheel zoom works. |
| Save project as JPG | Present | Export as JPEG. |
| Save project as PNG | Present | Export as transparent/white/checkerboard PNG. |
| Save project as PDF | Present | Export as single-page PDF. |
| Save project in additional format | Present | `.webster` native project format. |
| Share in social networks | Planned | Not implemented. |
| User-created templates | Present | Implemented. |
| Shared project frontend | Partial | File menu can open/share shared projects and the Versions panel can call snapshot/export APIs, but backend routes are not implemented. |
| Collaboration roles | Partial | Frontend owner/editor/viewer permissions exist. Backend auth/permission enforcement is not implemented. |
| Realtime collaboration | Partial | Frontend WebSocket client, operation queue, previews, commits, reconnect resend, and presence UI exist. Server WebSocket logic is not implemented. |
| Import font | Present | Font import is available from File and text-layer properties. |
