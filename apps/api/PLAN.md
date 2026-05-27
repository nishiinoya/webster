# Webster Backend — Fleet Implementation Plan

This document is the single source of truth for building the Webster backend. Every subagent in `.claude/agents/` references a specific section here. Do not deviate from the contracts without updating this file.

## 0. Locked decisions

| Decision | Value |
|---|---|
| Framework | NestJS (TypeScript) |
| Location | `apps/api` (workspace package `@webster/api`) |
| ORM | Prisma (schema-first, auto-migrations, auto-types) |
| Database | PostgreSQL 16 |
| Object storage | S3-compatible via MinIO in docker-compose |
| Auth | Auth0 — backend only validates JWTs and syncs users by `auth0_subject` |
| Email confirmation | Trust Auth0's `email_verified` claim; block unverified users at JWT guard level |
| WebSocket | **Socket.IO** via `@nestjs/platform-socket.io`. Frontend `CollaborationClient.ts` will be rewritten to use `socket.io-client` (Agent N owns that swap). |
| Realtime state | No operation log. Server holds current manifest in `projects.metadata`, increments `current_version`, broadcasts ops to other clients |
| Snapshots | Persisted in `project_snapshots` (manual checkpoints only) |
| Stripe | Subscriptions + payments + webhooks; price IDs from env vars |
| Public sharing links | Schema supports it (`shared_with_user_id IS NULL`); v1 still requires Auth0 login (no anonymous access yet) |
| Node version | 22 LTS |
| Frontend integration | Separate developer owns frontend. A minimal Auth0 login/callback page is in scope (Agent I), nothing more |

## 1. Schema adjustment (single, minimal)

Add ONE column to `projects` table for shared-editing version sync:

```diff
 Table projects {
   ...
   metadata jsonb
+  current_version int [default: 0, not null, note: 'Increments on every committed shared-edit operation. Used for optimistic concurrency.']
   is_deleted boolean ...
 }
```

Everything else in `db.io` stays as-is. The `metadata` column holds the live `WebsterProjectManifest` JSON between snapshots.

## 2. Folder structure (pre-defined so agents cannot collide)

```
apps/api/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── .env.example
├── .eslintrc.cjs
├── PLAN.md                  ← this file
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/          (Prisma-generated)
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── config/
    │   ├── configuration.ts
    │   └── env.validation.ts
    ├── database/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── common/
    │   ├── auth/
    │   │   ├── auth.module.ts
    │   │   ├── jwt.strategy.ts
    │   │   ├── jwt-auth.guard.ts
    │   │   ├── ws-auth.guard.ts
    │   │   ├── public.decorator.ts
    │   │   └── current-user.decorator.ts
    │   ├── filters/
    │   │   └── all-exceptions.filter.ts
    │   ├── pipes/
    │   │   └── parse-uuid.pipe.ts
    │   └── types/
    │       └── auth-user.ts
    └── modules/
        ├── users/
        ├── projects/
        ├── shared-projects/     ← orchestrator, Phase 2
        ├── assets/
        ├── snapshots/
        ├── accesses/
        ├── comments/
        ├── subscriptions/
        ├── payments/
        ├── storage/             ← S3/MinIO wrapper
        ├── webster/             ← .webster zip pack/unpack
        └── collaboration/       ← WebSocket gateway

docker/
├── api.Dockerfile
├── web.Dockerfile
├── postgres-init.sql
└── minio-init.sh
docker-compose.yml               (repo root)
```

**Rule:** an agent owns exactly one folder under `src/modules/<X>/` (or the equivalent for Phase 0 / Docker). Cross-module access goes through the consuming module's exported `*Service`. Never modify files outside your owned folder, except `app.module.ts` is owned by Phase 0 and already imports every stub module.

## 3. Phase 0 — Foundation (1 agent, serial, must finish first)

### Owned files

- `apps/api/package.json` (deps below)
- `apps/api/tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.eslintrc.cjs`
- `apps/api/.env.example`
- `apps/api/prisma/schema.prisma` — translated from `db.io` + the `current_version` column
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/**`
- `apps/api/src/database/**`
- `apps/api/src/common/**`
- Empty module stubs in every `src/modules/<name>/<name>.module.ts` (an exported `@Module({})` class) wired into `AppModule`

### Dependencies

```
@nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config
@nestjs/passport passport passport-jwt jwks-rsa
@nestjs/websockets @nestjs/platform-socket.io socket.io
@nestjs/event-emitter
@nestjs/swagger
prisma @prisma/client
class-validator class-transformer
@aws-sdk/client-s3 @aws-sdk/s3-request-presigner
adm-zip
stripe
@webster/shared (workspace dep)

dev: typescript ts-node @types/node @types/express @types/passport-jwt @types/adm-zip
```

### Auth0 wiring (Phase 0 ships this)

- `config.auth0.domain` from `AUTH0_DOMAIN` (e.g. `webster.eu.auth0.com`)
- `config.auth0.audience` from `AUTH0_AUDIENCE` (e.g. `https://api.webster.app`)
- `JwtStrategy` uses `passport-jwt` with `jwks-rsa.passportJwtSecret({ jwksUri: 'https://${domain}/.well-known/jwks.json' })`, `algorithms: ['RS256']`, `audience`, `issuer: 'https://${domain}/'`
- `JwtAuthGuard` is the global default via `APP_GUARD`. Validates `email_verified === true`; if false, throws `403 forbidden`.
- `@Public()` decorator opts a route out (used for `/api/health` and Stripe webhook)
- `@CurrentUser()` resolves the local DB row by `auth0_subject` (find-or-create on first hit, sync `email` and `display_name` from JWT claims)

### Global wiring

- `app.setGlobalPrefix('api')` (REST only — WS gateway is at `/ws`)
- CORS configurable via `CORS_ORIGIN` (comma list)
- `ValidationPipe({ transform: true, whitelist: true })` global
- `AllExceptionsFilter` global → emits `{code, message, projectId?}` matching frontend `ProjectErrorPayload`
- Stripe webhook path uses `express.raw({type:'application/json'})` middleware (Phase 0 wires the exception in `main.ts`)
- `GET /api/health` → `{status: 'ok'}`, `@Public()`

### `.env.example`

```
DATABASE_URL=postgresql://webster:webster@localhost:5432/webster
PORT=4000
CORS_ORIGIN=http://localhost:3000
AUTH0_DOMAIN=
AUTH0_AUDIENCE=
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=webster
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
```

### Definition of done

- `cd apps/api && npm run start:dev` boots
- `GET /api/health` → `{status:'ok'}`
- `npx prisma migrate dev` produces a clean migration against fresh Postgres
- All 11 empty module stubs imported in `AppModule`

## 4. Phase 1 — Parallel modules (11 agent slots, fully independent)

All Phase-1 agents follow the same rules:
1. Own exactly `apps/api/src/modules/<name>/`.
2. Read shared types from `@webster/shared`.
3. Inject `PrismaService` from foundation.
4. Inject cross-module services only via `@Optional()` — if a sibling module isn't ready yet, your code must compile and start (calls become no-ops).
5. Never edit `app.module.ts` or any file outside your folder.

### Agent A — `modules/users/`

**Files:**
```
users.module.ts
users.controller.ts
users.service.ts
dto/update-user.dto.ts
```

**Endpoints (Auth0 JWT required):**

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/users/me` | — | `{id, email, displayName, createdAt, updatedAt}` |
| PATCH | `/api/users/me` | `{displayName?: string}` | same as GET |

The `@CurrentUser()` decorator already upserts on every request; this module is the read/write surface.

### Agent B — `modules/storage/`

Exports `StorageModule` and `StorageService`.

**Public interface (DO NOT CHANGE — sibling agents depend on this):**

```ts
class StorageService {
  putObject(key: string, body: Buffer | Readable, mimeType: string): Promise<{ key: string; size: number }>;
  getObject(key: string): Promise<{ body: Readable; mimeType: string; size: number }>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  buildKey(...parts: string[]): string;  // sanitizes and joins with '/'
}
```

Uses `@aws-sdk/client-s3` with `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true`. On module init, ensure `S3_BUCKET` exists (create if missing).

### Agent C — `modules/webster/`

Exports `WebsterModule` and `WebsterPackageService`.

**Public interface (DO NOT CHANGE):**

```ts
type UnpackedPackage = {
  manifest: WebsterProjectManifest;
  assets: { path: string; mimeType: string; data: Buffer }[];
};
class WebsterPackageService {
  unpack(zipBuffer: Buffer): Promise<UnpackedPackage>;
  pack(manifest: WebsterProjectManifest, assets: { path: string; data: Buffer; mimeType: string }[]): Promise<Buffer>;
}
```

Uses `adm-zip`. Manifest path inside zip is `manifest.json`; asset entries are at their `assetPath` (relative paths, forward slashes).

### Agent D — `modules/projects/`

Generic project CRUD. Not the shared-editing routes — those are Phase 2.

**Files:**
```
projects.module.ts
projects.controller.ts
projects.service.ts
project-access.service.ts   ← exported for siblings
dto/create-project.dto.ts
dto/update-project.dto.ts
```

**Endpoints (Auth0 required):**

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/projects` | — | `{projects: ProjectSummary[]}` — owner OR has `project_accesses` row |
| GET | `/api/projects/:id` | — | `ProjectDetail` |
| POST | `/api/projects` | `{projectName, manifest?: WebsterProjectManifest}` | `ProjectDetail` |
| PATCH | `/api/projects/:id` | `{projectName?}` | `ProjectDetail` |
| DELETE | `/api/projects/:id` | — | `204` (soft via `is_deleted=true`) |

`ProjectSummary = {id, projectName, mimeType, sizeBytes, updatedAt, role}`.

**Exported `ProjectAccessService`:**

```ts
type EffectiveRole = 'owner' | 'editor' | 'viewer' | 'commenter' | null;

class ProjectAccessService {
  resolveRole(projectId: string, userId: string): Promise<EffectiveRole>;
  requireRole(projectId: string, userId: string, min: EffectiveRole): Promise<void>;
  toFrontendRole(role: EffectiveRole): ProjectRole;  // 'commenter' → 'viewer'
}
```

Frontend `ProjectRole` (`owner|editor|viewer`) is derived from internal role; `commenter` becomes `viewer` to the frontend but can still POST comments via Agent H.

### Agent E — `modules/assets/`

Asset CRUD for `project_assets`. Owns the routes the frontend calls during shared editing.

**Depends on (`@Optional()`):** `StorageService` (B), `ProjectAccessService` (D).

**Endpoints (Auth0 required, ≥ editor role enforced):**

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/shared-projects/:projectId/assets` | multipart: `metadata` JSON field = `{assets:[{assetId, assetPath, fileField, mimeType}]}`, plus file parts `asset-0`, `asset-1`, … | `{assets: SharedProjectAssetReference[]}` |
| GET | `/api/shared-projects/:projectId/assets/*` | — | streams binary; `Content-Type` from `project_assets.mime_type` |

Storage layout: `projects/<projectId>/assets/<assetPath>`. The `assetPath` from the manifest is preserved verbatim. On collision, UPSERT (`project_id + storage_key` unique). `downloadUrl` returned is the relative path `/api/shared-projects/<projectId>/assets/<assetPath>` — the frontend prepends its API base.

### Agent F — `modules/snapshots/`

**Depends on:** `ProjectAccessService` (D), optionally `RoomService` (K).

**Endpoints:**

| Method | Path | Body | Permission | Returns |
|---|---|---|---|---|
| GET | `/api/shared-projects/:projectId/snapshots` | — | viewer+ | `{snapshots: SharedProjectSnapshotSummary[]}` |
| POST | `/api/shared-projects/:projectId/snapshots` | `{message?}` | editor+ | `SharedProjectSnapshotSummary` |
| POST | `/api/shared-projects/:projectId/snapshots/:snapshotId/restore` | — | owner only | `SharedProjectLoadResponse` |

**Restore behavior:** copy `project_snapshots.state_data` → `projects.metadata`, increment `projects.current_version`, then call `roomService?.notifyProjectReplaced(projectId, newManifest, newVersion, byUser)` so connected clients reload (gateway emits a `scene:replace` op + `project:state`).

### Agent G — `modules/accesses/`

**Endpoints (Auth0 required, owner only on the target project):**

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/projects/:id/accesses` | — | `{accesses: Access[]}` |
| POST | `/api/projects/:id/accesses` | `{email, permission, expiresAt?}` | `Access` |
| PATCH | `/api/projects/:id/accesses/:accessId` | `{permission?, expiresAt?}` | `Access` |
| DELETE | `/api/projects/:id/accesses/:accessId` | — | `204` |
| POST | `/api/projects/:id/accesses/public-link` | `{permission, expiresAt?}` | `{accessId, link}` — `shared_with_user_id=null` row (infrastructure only; no anonymous fetch route in v1) |

When granting by email: if the target user does not exist locally, create a pending row (`auth0_subject = null`, `email = grantee_email`). On first Auth0 login matching that email, the JWT strategy attaches the new `auth0_subject` to the pending row instead of creating a duplicate.

### Agent H — `modules/comments/`

**Endpoints (Auth0 required, commenter+):**

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/projects/:id/comments` | — | `{comments: Comment[]}` (threaded) |
| POST | `/api/projects/:id/comments` | `{content, x?, y?, parentCommentId?}` | `Comment` |
| PATCH | `/api/projects/:id/comments/:commentId` | `{content?, isResolved?}` | `Comment` |
| DELETE | `/api/projects/:id/comments/:commentId` | — | `204` (soft) |

Comment editing: only author. Resolving: editor+ or author.

### Agent I — `modules/subscriptions/`

**Files include `stripe.service.ts`** (thin wrapper around the Stripe SDK).

**Endpoints:**

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/subscriptions/me` | required | — | `Subscription \| null` |
| POST | `/api/subscriptions/checkout` | required | `{priceId, successUrl, cancelUrl}` | `{url}` (Stripe Checkout) |
| POST | `/api/subscriptions/portal` | required | `{returnUrl}` | `{url}` (Stripe Customer Portal) |
| POST | `/api/subscriptions/webhook` | `@Public()` (Stripe-signed) | raw body | `200` |

Webhook handles:
- `checkout.session.completed` → upsert subscription
- `customer.subscription.updated` → update status / period end
- `customer.subscription.deleted` → mark canceled
- `invoice.paid` → emit `stripe.payment.succeeded` via `EventEmitter2`

Price IDs from `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_YEARLY`. Validate that incoming `priceId` matches one of these before creating a Checkout session.

### Agent J — `modules/payments/`

**Endpoints (Auth0 required):**

| Method | Path | Returns |
|---|---|---|
| GET | `/api/payments` | `{payments: Payment[]}` — current user, newest first |

**Event consumer:** listens for `stripe.payment.succeeded` (`@OnEvent`) and inserts a `payments` row. This decouples J from I.

### Agent K — `modules/collaboration/`

**Files:**
```
collaboration.module.ts
collaboration.gateway.ts
room.service.ts             ← exported
presence.service.ts
operation-applier.service.ts
ws-message.dto.ts
```

**WS transport:** Socket.IO via `@nestjs/platform-socket.io`. Gateway namespace `/` is fine; rooms are keyed by `project:<projectId>`. Configure CORS in the gateway options to match `CORS_ORIGIN`.

**Auth on connect:** Auth0 JWT from `socket.handshake.auth.token` (preferred — set by frontend via `io(url, {auth:{token}})`) with `?token=` query string as fallback. Use a `SocketIoAuthMiddleware` registered on the gateway. Reject with `disconnect()` on invalid/missing token or `email_verified !== true`.

**Message protocol (Socket.IO events — same names as in `@webster/shared`):**

Client → server:

| Event | Payload | Behavior |
|---|---|---|
| `project:join` | `{clientId, projectId}` | Verify access. `socket.join('project:'+projectId)`. Emit `project:state` to the joining socket only (snapshot + assets + role + presence + snapshot summaries). Broadcast `presence:update` to room. |
| `project:leave` | `{clientId, projectId}` | `socket.leave(...)`. Broadcast `presence:update`. |
| `operation:preview` | `ProjectOperation` | Relay to OTHER sockets in room only (`socket.to(room).emit(...)`). No persistence. |
| `operation:commit` | `ProjectOperation` | See commit flow below. |
| `presence:cursor` | `{clientId, cursor, projectId, tool}` | Update `PresenceService` map. Broadcast `presence:update` to room. |

**Commit flow (per-project async mutex):**
1. If `op.baseVersion !== projects.current_version` → reply to sender only: `project:error {code:'version_conflict', message, projectId}`.
2. Else: increment `current_version`, replace `metadata` with `op.scene` if present (else delegate to `OperationApplierService.apply(currentManifest, op)`).
3. Broadcast `operation:applied` to ALL clients in room (sender included) with the new `version`.
4. No DB write of the operation itself (per locked decision).

**`PresenceService`:** in-memory `Map<projectId, Map<clientId, SharedProjectPresence>>`. Cleared on disconnect.

**`RoomService` (exported):**

```ts
class RoomService {
  broadcastToRoom(projectId: string, event: ServerToClientCollaborationEvent): void;
  notifyProjectReplaced(projectId: string, newManifest: WebsterProjectManifest, newVersion: number, byUser: AuthUser): Promise<void>;
  getPresence(projectId: string): SharedProjectPresence[];
}
```

`notifyProjectReplaced` emits `scene:replace` as an `operation:applied` envelope AND a fresh `project:state` so clients are guaranteed to re-hydrate.

### Concurrency model

Use a `Map<projectId, Promise<void>>` so commits on the same project serialize, but different projects run in parallel. Lock acquisition wraps the entire commit flow steps 1–3.

## 5. Phase 2 — Orchestrator + deployment (parallel)

### Agent L — `modules/shared-projects/`

**Depends on:** Storage (B), Webster (C), Projects/Access (D), Assets (E), Snapshots (F).

**Endpoints (Auth0 required):**

| Method | Path | Body | Permission | Returns |
|---|---|---|---|---|
| POST | `/api/shared-projects/import-webster` | multipart, single file field | authenticated | `{projectId, projectName}` |
| GET | `/api/shared-projects/:projectId` | — | viewer+ | `SharedProjectLoadResponse` |
| GET | `/api/shared-projects/:projectId/export-webster` | — | editor+ | `application/zip` stream, `Content-Disposition` set |

**Import flow:**
1. Read upload buffer.
2. `WebsterPackageService.unpack(buffer)`.
3. `INSERT projects` (owner = current user, `metadata = manifest`, `current_version = 0`, `storage_key = projects/<id>/manifest.json`, `project_name` = filename without `.webster` or `manifest.template?.name`).
4. For each asset: `StorageService.putObject('projects/<id>/assets/<asset.path>', ...)` + INSERT `project_assets`.
5. Return `{projectId, projectName}`.

**Load flow:**
1. `ProjectAccessService.resolveRole`. 404 if none.
2. Load project row.
3. Load all `project_assets`, map to `SharedProjectAssetReference[]` (`downloadUrl` relative as in Agent E).
4. Load top-50 `project_snapshots` summaries.
5. Load `RoomService.getPresence(projectId)`.
6. Return `SharedProjectStatePayload`.

**Export flow:**
1. Access check (editor+).
2. Load manifest from `projects.metadata`.
3. Stream-pull all assets referenced by manifest from S3.
4. `WebsterPackageService.pack(...)` → zip buffer.
5. Stream as response.

### Agent M — Docker + deployment

**Owned files:**

- `docker-compose.yml` (root)
- `docker/api.Dockerfile`
- `docker/web.Dockerfile`
- `docker/postgres-init.sql`
- `docker/minio-init.sh`
- `.dockerignore`
- README "Backend" section

**docker-compose services:**

- `postgres` (postgres:16, persistent volume, healthcheck)
- `minio` (minio/minio:latest, ports 9000/9001, persistent volume)
- `minio-init` (one-shot mc job creating `webster` bucket if missing)
- `api` (built from `docker/api.Dockerfile`, port 4000, depends on postgres + minio; start command runs `npx prisma migrate deploy && node dist/main.js`)
- `web` (built from `docker/web.Dockerfile`, port 3000, env injects `NEXT_PUBLIC_WEBSTER_API_URL=http://localhost:4000/api`, `NEXT_PUBLIC_WEBSTER_WS_URL=http://localhost:4000` — Socket.IO uses HTTP(S) URLs, not `ws://`)

Both Dockerfiles are multi-stage. `api.Dockerfile` runs `npm ci` at workspace root then `npm run build -w @webster/api`. `web.Dockerfile` runs `npm run build -w @webster/web`.

## 6. Inter-module contracts (this is why fleet agents will not collide)

Every cross-module call goes through a typed exported service declared in the module's `*.module.ts` `exports: [...]`.

| Exported service | Owned by | Consumed by |
|---|---|---|
| `PrismaService` | Phase 0 | everyone |
| `StorageService` | B | E, F (optional), L |
| `WebsterPackageService` | C | L |
| `ProjectAccessService` | D | E, F, G, H, K, L |
| `RoomService` | K | F, L |
| `EventEmitter2` event `stripe.payment.succeeded` | I emits | J listens |

If an agent's required sibling is not yet present at compile time, inject with `@Optional()` and gracefully degrade. Phase 0 ships every module stub, so type imports always resolve.

## 7. Frontend integration

Frontend is owned by a separate developer. Two pieces of frontend work are inside this fleet:

### Agent N — Minimal Auth0 page (`apps/web`)

The other frontend developer will own profile, login improvements, and Auth0 wiring on the existing editor screens. The fleet only ships the bare minimum so backend can be exercised end-to-end:

- Install `@auth0/auth0-react` and `socket.io-client`.
- Add `<Auth0Provider>` in `apps/web/src/app/layout.tsx`.
- Add `apps/web/src/app/login/page.tsx` — single button "Continue with Auth0" using `loginWithRedirect()`. Style reuses existing Tailwind utility classes and the editor's panel/button look (study `apps/web/src/editor/ui/` for color tokens, button shapes, and panel chrome). Do not invent new design tokens.
- Add `apps/web/src/app/callback/page.tsx` — handles Auth0 redirect, then `router.replace('/')`.
- Inject `Authorization: Bearer <accessToken>` into the existing REST helper at `apps/web/src/editor/collaboration/sharedProjectApi.ts` (only the auth header line — do not rewrite the file).
- **Rewrite `apps/web/src/editor/collaboration/CollaborationClient.ts`** to use `socket.io-client` instead of raw `WebSocket`. Keep the same public class API (`sendPreview`, `sendCommit`, `sendPresence`, callbacks) so the rest of the editor is unaffected. Token is passed via `io(url, {auth: {token: accessToken}})`. URL comes from `NEXT_PUBLIC_WEBSTER_WS_URL` env var (no `{projectId}` substitution — Socket.IO uses one connection and rooms via `project:join`).
- Required env vars: `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE`, `NEXT_PUBLIC_AUTH0_REDIRECT_URI`.

Out of scope (other developer): profile page, sign-out UX polish, role-aware UI gating, error states, social providers.

### Agent O — Frontend contract guardian (read-only, optional)

Verifies the backend stays compatible with `apps/web/src/editor/collaboration/`. Runs spot checks:
- Every REST path called from `sharedProjectApi.ts` exists in a backend controller.
- WS message types in `CollaborationClient.ts` match the gateway handlers.
- `SharedProjectAssetReference.downloadUrl` shape matches what the frontend assembles.

Reports drift. Does not write code; opens issues for the responsible module's agent to fix.

## 8. Execution order

```
Phase 0 (serial, 1 agent):     Foundation
        ↓
Phase 1 (11 parallel agents):  A=Users  B=Storage  C=Webster  D=Projects
                               E=Assets F=Snapshots G=Accesses H=Comments
                               I=Subscriptions J=Payments K=Collaboration
        ↓
Phase 2 (2 parallel agents):   L=SharedProjects  M=Docker
        ↓
Frontend bridge (1 agent):     N=Auth0 page
        ↓
Smoke test:                    docker compose up → /api/health → two-tab shared edit
```

Agent O runs continuously alongside Phase 1+2.

## 9. Definition of done — overall

1. `docker compose up` boots Postgres + MinIO + API + Web with no errors.
2. `http://localhost:3000/login` → Auth0 → callback → editor loads, JWT attached to requests.
3. Backend creates a `users` row keyed by `auth0_subject` on first authenticated request.
4. User shares a local project; backend unpacks `.webster`, stores assets in MinIO, returns `projectId`. Frontend redirects to shared mode.
5. Two browser tabs in shared mode show each other's edits in real time.
6. Owner creates and restores a snapshot; both tabs reload state.
7. Owner grants editor access by email; granted user sees the project in `/api/projects`.
8. Comments can be created, replied to, resolved.
9. Stripe CLI fires `customer.subscription.updated` → `subscriptions` row updates; `invoice.paid` → `payments` row appears.
10. All endpoints respond `401` without a valid Auth0 JWT (except `/api/health` and the Stripe webhook).

## 10. Open items not yet resolved

These do not block Phase 0 or 1 but should be resolved before the fleet finishes:

1. **Public-link unauthenticated access** — schema supports it; v1 still requires login. Future: a tokenized `?share=<jti>` route that grants view-only access without Auth0.
2. **Thumbnail generation for snapshots** — `project_snapshots.thumbnail_storage_key` exists in schema; v1 leaves null. A separate task can add it via off-canvas WebGL rendering on the client at snapshot time.
3. **Migration of frontend `ProjectRole`** — current frontend doesn't know about `commenter`. Mapping `commenter → viewer + canComment` is fine for now; future work is to surface a real `commenter` role in `@webster/shared`.
