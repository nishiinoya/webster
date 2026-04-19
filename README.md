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

- Present: implemented in the app.
- Partial: implemented, but still has known limitations.
- Planned: not implemented yet.

| Area | Status | Notes |
| --- | --- | --- |
| Editor workspace | Present | Top menus, tool rail, tabs, WebGL canvas, layers, properties, and history panels exist. |
| Top menus | Partial | File and Select have real actions. Edit/View/Filter now contain useful entries plus disabled TODO items. |
| Project templates/presets | Partial | New document presets exist: 1200x800, 1920x1080, 1080x1080. User-created templates are planned. |
| New project creation | Present | New document dialog creates a blank document from preset/custom size. |
| WebGL rendering | Present | Scene rendering is outside React and handled by `Renderer`. |
| Layers | Present | Image, text, shape, stroke, and adjustment layers are supported. |
| Layer properties | Present | Transform, visibility, lock, opacity, text, shape, mask, and filter controls exist. |
| Adjustment layers | Partial | Adjustment layers affect layers below and can be moved/scaled to limit the affected rectangular region. Rotated adjustment layers currently use their world bounding box. |
| Per-layer filters | Present | Brightness, contrast, saturation, grayscale, hue, sepia, invert, shadow, blur, and drop shadow settings exist. |
| Shader filter rendering | Partial | Basic filters are shader uniforms. Image blur is texture-sampled in shader. Vector/text/brush blur is edge softness; perfect outward blur needs a framebuffer pass. |
| Drop shadow | Partial | Drop shadow is rendered as GPU passes behind the layer. It is useful but not a full Photoshop-style shadow renderer yet. |
| Add images | Present | Image import creates an image layer. |
| Move elements by mouse | Present | Move tool can select, move, resize, and rotate layers. |
| Move elements by keyboard | Planned | Arrow-key nudging is not implemented yet. |
| Delete elements | Present | Layer menu supports deleting layers. Keyboard delete is planned. |
| Canvas pan | Present | Pan tool and middle mouse panning are supported. |
| Canvas zoom | Present | Mouse wheel zoom is supported. Dedicated Zoom tool was removed because wheel zoom already covers it. |
| Canvas resize | Partial | New documents can be created at chosen sizes. Resizing an existing canvas is planned. |
| Selection tools | Present | Rectangle Select and Ellipse Select are implemented. |
| Selection placeholders | Planned | Lasso Select and Magic Select are visible as disabled future tools. |
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
| History panel | Partial | Panel exists, but full undo/redo history is not implemented. Mask brush stroke undo exists. |
| Save `.webster` | Present | Saves a portable project package with `manifest.json` and image assets. |
| Open `.webster` | Present | Opens saved Webster project packages. |
| Recent project handle | Present | Uses browser File System Access API/IndexedDB when available. |
| Export PNG | Present | `File -> Export as... -> PNG`; transparent background option, no editor UI/tools in output. |
| Export JPEG/JPG | Present | `File -> Export as... -> JPEG`; white or checkerboard background, no editor UI/tools in output. |
| Export PDF | Present | `File -> Export as... -> PDF`; single-page PDF with white or checkerboard background, no editor UI/tools in output. |
| Export color consistency | Partial | Export path uses WebGL offscreen rendering; color issues have been worked on, but more browser/device validation is still useful. |
| Extra export format | Present | `.webster` project package is the extra native project format. |
| Social sharing | Planned | Sharing to social networks is not implemented yet. |
| Authentication | Planned | Registration, login, email confirmation, and profile editing are not implemented. |
| Backend API | Planned | `apps/api` is reserved but currently empty. |
| Database | Planned | No server database is currently used. |
| Hosted domain | Planned | No production domain is configured in this repository. |
| Docker deployment | Planned | Dockerfile and docker-compose.yml are not implemented yet. |

## Tools

The tool rail shows active editor tools plus disabled placeholders for future selection tools.

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
| Lasso Select | Planned | Disabled placeholder for freehand selection. |
| Magic Select | Planned | Disabled placeholder for color/similarity-based selection. |

Removed from the active tool list:

- Zoom: removed because wheel zoom is already implemented.

## Top Menus

| Menu | Status | Notes |
| --- | --- | --- |
| File | Present | New, open `.webster`, import image, save, save as, and export. |
| Edit | Partial | Tool shortcuts exist. Undo/redo/cut/copy/paste are visible TODO items. |
| View | Partial | Current zoom display and Pan workspace action exist. Fit canvas, keyboard zoom, checkerboard toggle, rulers, and guides are TODO. |
| Filter | Partial | Can add an adjustment layer. Implemented filter families are listed. Filter gallery and clipping adjustment to one layer/group are TODO. |
| Select | Present | Clear selection, invert selection, and convert selection to mask. |

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
| Text keyboard input | Present | Typing, caret movement, selection, copy/paste text input, delete/backspace, and multiline text editing exist while editing text. |
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

- PNG: transparent, white, or checkerboard background depending on export option.
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
- image layers
- text layers
- shape layers
- stroke layers and per-path brush settings
- adjustment layers
- layer masks
- selection clips stored on stroke paths
- transforms: x, y, width, height, scale, rotation
- visibility, opacity, lock state
- per-layer filter settings

## What Is Left To Implement

This is the practical remaining-work checklist.

### Core Editing

- Full command-based undo/redo for layer creation, deletion, transforms, filters, masks, text edits, and strokes.
- Keyboard delete for selected layer.
- Arrow-key nudging for selected layer/selection.
- Copy, cut, and paste for layers.
- Copy, cut, and paste for selected pixel/selection area.
- Duplicate layer command.
- Layer grouping.
- Better layer ordering shortcuts from menus/keyboard.
- Canvas resize for an existing project.
- Crop document to selection.

### Selection

- Lasso Select implementation.
- Magic Select/color similarity selection.
- Add/subtract/intersect selection modes.
- Feather selection.
- Grow/shrink selection.
- Save/load selection.
- More exact rotated adjustment/selection region handling where needed.

### Filters And Effects

- Offscreen framebuffer/post-process pipeline for true blur on all layer types.
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
- Collaboration/realtime cursors later.

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
| Show project build logs | Partial | Local `npm run build:web` compiles, but this Windows/OneDrive workspace currently hits `spawn EPERM` during Next's later build phase. Docker build logs are not available until Docker config is added. |
| App works on hosting by domain name | Planned | No hosted domain is configured. |
| Explain database choice | Partial | No DB currently; PostgreSQL is the planned production choice. |
| Go to app homepage | Present | Local homepage runs at `http://localhost:3000`. |
| User registration | Planned | No auth backend/UI yet. |
| User login | Planned | No auth backend/UI yet. |
| Email confirmation | Planned | No email/auth flow yet. |
| Modify user profile | Planned | No user profile system yet. |
| Project templates | Partial | Built-in document presets exist. User templates are planned. |
| Create new project | Present | New document dialog exists. |
| Add/work with text | Present | Text tool/layers are implemented. |
| Free drawing/pencil | Present | Draw tool is implemented. |
| Shape elements | Present | Rectangle, circle, line, triangle, diamond, and arrow are implemented. |
| Add pictures as elements | Present | Import image as layer works. |
| Move elements with mouse | Present | Move tool works. |
| Move elements with keyboard | Planned | Arrow-key movement is not implemented. |
| Delete elements from canvas | Present | Layer menu delete exists. Keyboard delete is planned. |
| Change history and restore previous version | Partial | History panel exists; full undo/revision restore is planned. |
| Resize canvas | Partial | New document size exists; resizing an existing document is planned. |
| Zoom canvas | Present | Mouse wheel zoom works. |
| Save project as JPG | Present | Export as JPEG. |
| Save project as PNG | Present | Export as transparent/white/checkerboard PNG. |
| Save project as PDF | Present | Export as single-page PDF. |
| Save project in additional format | Present | `.webster` native project format. |
| Share in social networks | Planned | Not implemented. |
| User-created templates | Planned | Not implemented. |
