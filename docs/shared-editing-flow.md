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

### Frontend Sends

| Event | Payload | Backend should do |
| --- | --- | --- |
| `project:join` | `{ projectId, clientId }` | Authenticate/authorize the socket, attach it to the project room, send `project:state`, and broadcast updated presence. This is sent after opening the socket and again after reconnect. |
| `project:leave` | `{ projectId, clientId }` | Remove this socket/client from the room and broadcast updated presence. |
| `operation:preview` | `ProjectOperation` with `phase: "preview"` | Check edit permission, do not persist, do not increment version, and broadcast the temporary preview to other users in the room. |
| `operation:commit` | `ProjectOperation` with `phase: "commit"` and `clientOperationId` | Check edit permission, dedupe by `clientOperationId`, validate `baseVersion`, persist the operation, increment project version, and broadcast `operation:applied`. |
| `presence:cursor` | `{ projectId, clientId, cursor, tool }` | Update the user's cursor/tool presence and broadcast `presence:update`. `cursor` can be `null` when the pointer leaves the canvas. |

### Frontend Receives

| Event | Payload | Frontend should do |
| --- | --- | --- |
| `project:state` | `SharedProjectStatePayload` | Hydrate the editor from `snapshot`, update `currentVersion`, role, permissions, assets, snapshots, and online users. |
| `operation:applied` | `AppliedProjectOperation` | Remove the matching pending commit when `clientOperationId` matches a local queued operation, update project version, and apply the operation to the local scene if needed. |
| `operation:preview` | `ProjectOperation` with `phase: "preview"` | Apply a temporary remote preview without saving it to local history or treating it as the confirmed project version. |
| `presence:update` | `SharedProjectPresence[]` | Refresh the online users list, cursors, colors, roles, and active tools. |
| `project:error` | `ProjectErrorPayload` | Show the error and follow the recovery path for the error code. |

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
