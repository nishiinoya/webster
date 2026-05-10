# Webster Shared Editing Flow

Webster has two project modes: local mode and shared mode. The frontend keeps
local mode as the default path and layers shared editing on top of the existing
`.webster` package format.

## Local Mode

Local mode is the existing editor behavior. The editor works without a backend,
stores the scene in browser memory, and can save/open `.webster` files with the
current project package code. Exporting images and PDFs also stays local.

A local `.webster` file is a ZIP package. It contains `manifest.json` with the
serialized scene, canvas, layer stack, selections, fonts, and project metadata.
Large binary data is stored as package entries and referenced from the manifest:
image layers point at asset paths, original image assets are kept separately when
needed, masks are serialized with their layer data, fonts are listed in
`manifest.json` and stored as asset entries, and 3D model packages are stored
under model asset paths when imported models are present.

Opening a local `.webster` file reads the ZIP, parses `manifest.json`, builds an
asset map, and calls the normal `Scene.fromJSON` path. This rebuilds layers,
image elements, masks, text layers, stroke layers, shape layers, adjustment
layers, and 3D layers from the same manifest shape used by save/export.

## Shared Mode

Shared mode starts from the same scene manifest shape. The frontend loads the
shared project with REST, hydrates the returned snapshot into the editor, opens a
WebSocket, and sends `project:join` for the project room. After join, the socket
is used only for realtime operations, previews, commits, presence, and errors.

The socket client lives in `apps/web/src/editor/collaboration`, not in editor
tools or random UI components. UI components call collaboration hooks; they do
not own WebSocket behavior.

## Complete Shared Editing Command List

This is the full frontend contract currently implemented for shared editing.
Backend developers can treat this section as the checklist for REST routes,
socket event handlers, and operation persistence.

## WebSocket Event Contract

Every WebSocket message uses the same JSON envelope:

```json
{
  "type": "operation:commit",
  "payload": {}
}
```

The socket carries realtime state only. Do not send `.webster` archives, images,
masks, fonts, 3D models, textures, or other large binary assets through it.

### Client To Server Socket Commands

| Event | Payload | Backend should do |
| --- | --- | --- |
| `project:join` | `{ projectId, clientId }` | Authenticate/authorize the socket, attach it to the project room, send `project:state`, and broadcast updated presence. This is sent after opening the socket and again after reconnect. |
| `project:leave` | `{ projectId, clientId }` | Remove this socket/client from the room and broadcast updated presence. |
| `operation:preview` | `ProjectOperation` with `phase: "preview"` | Check edit permission, do not persist, do not increment version, and broadcast the temporary preview to other users in the room. |
| `operation:commit` | `ProjectOperation` with `phase: "commit"` and `clientOperationId` | Check edit permission, dedupe by `clientOperationId`, validate `baseVersion`, persist the operation, increment project version, and broadcast `operation:applied`. |
| `presence:cursor` | `{ projectId, clientId, cursor, tool }` | Update the user's cursor/tool presence and broadcast `presence:update`. `cursor` can be `null` when the pointer leaves the canvas. |

### Server To Client Socket Events

| Event | Payload | Frontend should do |
| --- | --- | --- |
| `project:state` | `SharedProjectStatePayload` | Hydrate the editor from `snapshot`, update `currentVersion`, role, permissions, assets, snapshots, and online users. |
| `operation:applied` | `AppliedProjectOperation` | Remove the matching pending commit when `clientOperationId` matches a local queued operation, update project version, and apply the operation to the local scene if needed. |
| `operation:preview` | `ProjectOperation` with `phase: "preview"` | Apply a temporary remote preview without saving it to local history or treating it as the confirmed project version. |
| `presence:update` | `SharedProjectPresence[]` | Refresh the online users list, cursors, colors, roles, and active tools. |
| `project:error` | `ProjectErrorPayload` | Show the error and follow the recovery path for the error code. |

### ProjectOperation Payload

`operation:preview`, `operation:commit`, and `operation:applied.operation` use
the same operation object:

| Field | Meaning |
| --- | --- |
| `projectId` | Shared project id. |
| `clientId` | Id for the browser/client that created the operation. |
| `clientOperationId` | Stable id for deduping resent commit operations. |
| `baseVersion` | Project version the client was editing from. |
| `phase` | `"preview"` for temporary updates or `"commit"` for saved edits. |
| `kind` | One of the operation kinds listed below. |
| `payload` | Small command metadata, such as layer ids, command type, tool, or text action. |
| `scene` | Optional full `.webster` manifest-shaped snapshot for MVP apply/resync. |
| `assetReferences` | Optional references to server assets needed by the operation. |
| `label` | Human-readable action name for history/debug UI. |
| `createdAt` | Client creation timestamp. |

### Error Codes

| Code | Meaning | Frontend behavior |
| --- | --- | --- |
| `forbidden` | The user does not have permission for the attempted action. | Stop the attempted action, refresh role/permissions if needed, and keep viewer/editing controls disabled when appropriate. |
| `not_found` | The project or requested resource does not exist. | Stop shared mode for that project and show a load/join failure. |
| `socket_error` | The realtime connection failed. | Show disconnected/reconnecting state and keep pending commits queued. |
| `version_conflict` | The commit was based on an old project version. | Pause new commits, reload latest project state through REST, clear or rebuild pending commits, and continue after resync. MVP behavior is simple reload/resync. |

### Operation Kinds

The backend should accept the `ProjectOperationKind` values from
`packages/shared`:

- `asset:create`
- `document:update`
- `filter:update`
- `image-layer:update`
- `layer:create`
- `layer:delete`
- `layer:reorder`
- `layer:transform`
- `layer:update`
- `mask:paint`
- `object3d:update`
- `scene:replace`
- `selection:update`
- `shape:edit`
- `stroke:commit`
- `text:edit`

For the MVP, operations may include a full `scene` snapshot in the existing
`.webster` manifest shape. That lets the frontend apply remote commits through
the same scene import path as local `.webster` loading. Later, the backend and
frontend can make individual operation payloads more granular without changing
the socket event names.

### Editor Commands That Become Operations

These are the local editor actions the frontend converts into
`operation:commit` messages.

| Editor command/action | Operation kind |
| --- | --- |
| Canvas/document resize | `document:update` |
| Layer add adjustment | `layer:create` |
| Layer add 3D object | `layer:create` |
| Layer duplicate | `layer:create` |
| Layer group | `layer:create` |
| Layer delete | `layer:delete` |
| Layer move up/down | `layer:reorder` |
| Layer move to position | `layer:reorder` |
| Layer remove from group | `layer:reorder` |
| Layer mask add/remove/update | `mask:paint` |
| Layer property update | Depends on changed fields; see below. |
| Image layer resample | `image-layer:update` |
| Image layer restore original | `image-layer:update` |
| Selection clear | `selection:update` |
| Selection invert | `selection:update` |
| Selection feather | `selection:update` |
| Selection grow/shrink | `selection:update` |
| Selection save/load | `selection:update` |
| Convert selection to mask | `selection:update` |
| Import image layer | `asset:create` |
| Paste image layer, pasted clipboard image, or pasted selected pixels | `asset:create` |
| Import font | `asset:create` |
| Import shape texture | `asset:create` |
| Clear shape texture | `asset:create` |
| Import 3D model files/package | `object3d:update` |
| Create loaded 3D model layer | `object3d:update` |
| Replace loaded 3D model | `object3d:update` |
| Import or clear 3D material texture | `object3d:update` |
| Insert `.webster` template as group | `layer:create` |
| Add text layer | `layer:create` |
| Text insert | `text:edit` |
| Text delete backward | `text:edit` |
| Text delete forward | `text:edit` |
| Cut selected pixels | `scene:replace` |
| Cut layers | `scene:replace` |
| Paste layers | `scene:replace` |
| Unknown scene-level edit | `scene:replace` |

Layer update fields choose more specific operation kinds:

| Changed field group | Operation kind |
| --- | --- |
| `filters` | `filter:update` |
| `text`, `fontFamily`, `fontSize`, `align`, `bold`, `italic` | `text:edit` |
| `shape`, `fillColor`, `strokeColor`, `strokeWidth`, `customPath` | `shape:edit` |
| `objectKind`, `objectZoom`, `rotationX`, `rotationY`, `rotationZ`, `materialColor`, `materialTexture` | `object3d:update` |
| `x`, `y`, `width`, `height`, `rotation`, `scaleX`, `scaleY`, `imageGeometry` | `layer:transform` |
| opacity, visibility, lock state, blend mode, name, or other layer metadata | `layer:update` |

Pointer gestures are committed on pointer release and may also send previews
while the pointer is down:

| Tool/gesture | Preview operation | Commit operation |
| --- | --- | --- |
| Move | `operation:preview` with `layer:transform` | `operation:commit` with `layer:transform` |
| Transform | `operation:preview` with `layer:transform` | `operation:commit` with `layer:transform` |
| Crop | `operation:preview` with `layer:transform` | `operation:commit` with `layer:transform` |
| Draw | `operation:preview` with `stroke:commit` | `operation:commit` with `stroke:commit` |
| Mask Brush | `operation:preview` with `mask:paint` | `operation:commit` with `mask:paint` |
| Shape | `operation:preview` with `shape:edit` | `operation:commit` with `shape:edit` |
| Rectangle Select | `operation:preview` with `selection:update` | `operation:commit` with `selection:update` |
| Ellipse Select | `operation:preview` with `selection:update` | `operation:commit` with `selection:update` |
| Lasso Select | `operation:preview` with `selection:update` | `operation:commit` with `selection:update` |
| Magic Select | `operation:preview` with `selection:update` | `operation:commit` with `selection:update` |

Selection-only actions such as selecting a layer are local UI state and do not
need to become saved project operations unless they change the project scene.

### Exact Editor Command Values

These are the exact command values the backend may see inside
`ProjectOperation.payload`. The backend should persist the whole
`ProjectOperation` object, but this list is useful for validation, analytics,
debug logs, and future granular replay.

| Action source | Exact command/operation values |
| --- | --- |
| Document commands | `{ type: "resize" }` |
| Image layer commands | `{ type: "resample" }`, `{ type: "restore-original" }` |
| Layer commands | `{ type: "add-adjustment" }`, `{ type: "add-object3d" }`, `{ type: "delete" }`, `{ type: "duplicate" }`, `{ type: "group" }`, `{ type: "mask" }`, `{ type: "move-to-position" }`, `{ type: "move-down" }`, `{ type: "move-up" }`, `{ type: "remove-from-group" }`, `{ type: "update" }`, `{ type: "nudge" }` |
| Local-only layer command | `{ type: "select" }` changes UI selection only and should not be persisted as a project operation. |
| Layer asset commands | `{ type: "clear-3d-material-texture" }`, `{ type: "clear-shape-texture" }`, `{ type: "create-3d-model-layer" }`, `{ type: "create-loaded-3d-model-layer" }`, `{ type: "import-font" }`, `{ type: "import-3d-material-texture" }`, `{ type: "import-3d-model" }`, `{ type: "replace-loaded-3d-model" }`, `{ type: "import-shape-texture" }` |
| Selection commands | `"clear"`, `"convert-to-mask"`, `"invert"`, `{ type: "grow" }`, `{ type: "shrink" }`, `{ type: "load" }`, `{ type: "save" }`, `{ type: "feather" }` |
| Scene operations | `"insert-template-group"`, `"cut-selected-pixels"`, `"cut-layers"`, `"paste-layers"`, `"drop-3d-model"`, `"drop-shape-texture"`, `"add-text-layer"`, `"paste-image-layer"`, `"import-image-layer"` |
| Text operations | `"insert"`, `"delete-backward"`, `"delete-forward"` |
| Gesture tools | `"Move"`, `"Transform"`, `"Crop"`, `"Draw"`, `"Mask Brush"`, `"Shape"`, `"Rectangle Select"`, `"Ellipse Select"`, `"Lasso Select"`, `"Magic Select"` |

The socket command does not change for these values. They all travel through
`operation:commit` when final, and pointer gestures can additionally travel
through `operation:preview` while in progress.

### Incoming Operation Support

The frontend handles all incoming socket event types listed above. For incoming
`operation:preview` and `operation:applied`, the MVP apply path is
snapshot-based:

- If the incoming `ProjectOperation` includes `scene`, the frontend imports that
  `.webster` manifest-shaped scene, fetches `assetReferences`, and updates the
  editor.
- If the incoming `ProjectOperation` only includes a granular `payload` without
  `scene`, the frontend does not replay that command yet.

This means the backend should include `operation.scene` on broadcast operations
and preserve `operation.assetReferences` for the current MVP. The command values
and operation kinds are still useful for permission checks, validation,
persistence, history, analytics, and future granular replay. A later frontend
reducer can apply each command payload directly without changing the socket
event names.

## Shared Mode REST Commands

Shared mode uses REST for loading, uploading, downloading, assets, and snapshots.
These are not WebSocket commands.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/shared-projects/import-webster` | Upload a local `.webster` Blob so the backend can create a shared project. |
| `GET` | `/shared-projects/:projectId` | Load shared project state, latest snapshot, current version, role, permissions, assets, snapshots, and users. |
| `GET` | `/shared-projects/:projectId/export-webster` | Download a backend-packed `.webster` file for the shared project. |
| `POST` | `/shared-projects/:projectId/assets` | Upload binary assets created while already in shared mode, before the socket commit/preview is sent. |
| `GET` | `/shared-projects/:projectId/snapshots` | List version history/checkpoints. |
| `POST` | `/shared-projects/:projectId/snapshots` | Create a manual snapshot/checkpoint. |
| `POST` | `/shared-projects/:projectId/snapshots/:snapshotId/restore` | Restore an old snapshot by creating a new current version from it. |
| `GET` | `asset.downloadUrl` | Download server assets referenced by `SharedProjectAssetReference`. |

The shared asset upload route receives `multipart/form-data`:

- `metadata`: JSON `{ "assets": [...] }`
- one file field per asset, named by each metadata entry's `fileField`

Each metadata asset entry includes:

- `assetPath`
- `assetId` when the frontend has one
- `mimeType`
- `fileField`

The backend should store each blob by `assetPath` for the project and return
`{ assets: SharedProjectAssetReference[] }` with download URLs. If the backend
returns no asset list, the frontend falls back to
`/shared-projects/:projectId/assets/:assetPath`.

This asset route is what makes new shared-mode binary edits work. It covers:

- imported image layers
- pasted selected pixels
- pasted clipboard images
- cut/cleared selected pixels that replace image-layer pixels
- image-layer resampling
- imported fonts
- shape textures
- 3D material textures
- imported 3D model packages, model JSON, geometry buffers, and texture files

Selection copy itself is local clipboard state and does not create a project
operation. Selection paste creates a new image layer with a new `assetId`; the
frontend uploads that new PNG asset through REST, then sends `operation:commit`
with `kind: "asset:create"` and `operation: "paste-image-layer"`.

## Local Project To Shared Project

When a user clicks Share project, the frontend creates a normal `.webster` Blob
using `EditorApp.exportProjectFile()`. It uploads that Blob through REST. The
backend should decompose the package, read `manifest.json`, extract assets,
store large assets separately, create the first snapshot, and return the shared
project state. The frontend then switches into shared mode and joins the socket
room.

`.webster` archives are never sent over WebSocket.

## Shared Project To Local File

When a user downloads a shared project, the frontend asks the backend for an
exported `.webster` file through REST. The backend should pack the latest
snapshot and referenced assets into the normal package format. The downloaded
file should open through the existing local `.webster` path.

## Operations

Preview operations are temporary realtime updates for drag, resize, rotate,
drawing while the pointer is down, mask brush preview, and cursor movement. They
use `operation:preview`, are not permanent history, and do not increase project
version.

Commit operations are autosaved edits. They use `operation:commit`, include a
`clientOperationId`, are saved by the backend, increase project version, and are
broadcast back as `operation:applied`. Every committed editor history action is
converted into a `ProjectOperation`.

The user should not need to click Save snapshot to avoid losing edits. Commits
are the save stream; snapshots are checkpoints.

## Pending Commits And Recovery

The frontend keeps commit operations in a pending queue until the backend
confirms them. If the socket disconnects, pending operations stay queued. After
reconnect and `project:join`, the frontend resends unconfirmed commits in order.

The backend should use `clientOperationId` to dedupe resent commits. If the
server saved a commit before a crash, the resent copy should confirm the saved
operation instead of applying twice.

If the backend reports a version conflict, the MVP frontend reloads the latest
project state through REST, clears pending commits, and resumes from the server
state. More advanced merge/reapply logic can be added later.

## Snapshots

Snapshots are full project checkpoints based on the existing `.webster` manifest
shape. They are useful for faster loading and version history. Operations are
smaller edits between snapshots.

The Version History panel shows snapshots returned by the backend: version,
date, author, message, and snapshot type. Users with permission can create a
manual snapshot, restore an older snapshot, refresh history, and download a
`.webster` export.

Restoring an old snapshot should not delete history. The backend should create a
new current version based on the restored snapshot.

## Roles

Roles live in `packages/shared`.

Owner can edit, manage members, create snapshots, restore snapshots, and
download `.webster`.

Editor can edit, create snapshots if allowed, and download `.webster` if
allowed.

Viewer can only view. The frontend disables editing tools and editing requests
for viewers while still receiving realtime updates and showing presence.
Download is allowed only when the backend grants that permission.

## Frontend Responsibilities

The frontend owns the local editor, UI state, role-based disabling, REST calls
for `.webster` upload/download, REST calls for shared snapshots, WebSocket room
join/leave, preview operations, commit operations, pending commit queue,
resending unconfirmed commits, applying remote operations to the scene, and
presence display.

The frontend understands backend crash recovery as:

latest snapshot + saved operations after that snapshot

It does not implement backend replay. It only resends unconfirmed local commits
after reconnect.

## Backend Responsibilities

The backend should store projects, members, roles, assets, snapshots, and saved
operations. It should decompose uploaded `.webster` files, pack downloadable
`.webster` files, store big images/masks/models/textures/assets outside the
operation stream, check permissions, dedupe `clientOperationId`, create
automatic/manual snapshots, restore snapshots by creating a new version, replay
latest snapshot plus operations after restart, and broadcast socket events to
project rooms.
