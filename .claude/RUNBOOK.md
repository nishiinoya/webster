# Webster Backend Fleet — Runbook

This is the operational guide for running the agent fleet that builds the Webster backend. Follow each step in order. The full spec is at [`apps/api/PLAN.md`](../apps/api/PLAN.md); the agents are in [`.claude/agents/`](agents/).

---

## 0. Prerequisites — do these BEFORE invoking the first agent

### 0.1 Local tooling

Install on your machine:

- **Node.js 22 LTS** — `node --version` should print `v22.x.x`
- **npm 10+** — comes with Node 22
- **Docker Desktop** with Compose v2 — `docker compose version`
- **PostgreSQL client (optional)** — `psql` for poking at the DB
- **Stripe CLI** — needed to test webhooks: https://stripe.com/docs/stripe-cli

### 0.2 Accounts you need before agents can finish

| Account | Why | Free? |
|---|---|---|
| Auth0 | All login. Backend validates Auth0-issued JWTs. | Yes (dev tier) |
| Stripe | Subscription checkout + webhook events. | Yes (test mode) |

**Auth0 setup (5 minutes):**

1. Create an Auth0 tenant at https://manage.auth0.com.
2. Create a **Single Page Application** — note `Domain` and `Client ID`.
3. Create an **API** — note the `Identifier` (this is your `audience`).
4. In SPA settings:
   - Allowed Callback URLs: `http://localhost:3000/callback`
   - Allowed Logout URLs: `http://localhost:3000`
   - Allowed Web Origins: `http://localhost:3000`

**Stripe setup (3 minutes):**

1. Create a Stripe account in test mode.
2. Dashboard → Developers → API keys → copy the **secret key** (`sk_test_...`).
3. Products → create one product with two prices (monthly + yearly). Copy both `price_...` IDs.
4. Run `stripe login` once on your machine.

### 0.3 Fill out env values you'll hand to agents

You will paste these into the API's `.env` and the web app's `.env.local` after the foundation agent ships them. Keep this block somewhere safe:

```
AUTH0_DOMAIN=<your-tenant>.auth0.com
AUTH0_AUDIENCE=https://api.webster.app   (or whatever you set)
AUTH0_CLIENT_ID=<from SPA settings>

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...          (you get this from `stripe listen`, step 7.4)
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
```

You can run Phase 0 and most of Phase 1 with placeholder values; the system only needs real values when you start exercising auth-protected routes.

---

## 1. How to invoke a subagent

Claude Code auto-discovers everything in `.claude/agents/`. To invoke one, in Claude Code chat:

- Type: `Use the <agent-name> agent to <what you want>`. Example: `Use the backend-foundation agent to scaffold apps/api per PLAN.md.`
- Or explicitly: `@agent <agent-name> <instruction>`.
- For agents that handle multiple slots (`nest-module`, `storage-engineer`), pass the slot letter in your instruction: `Use the nest-module agent to build module A (Users).`

You can also run agents **in parallel** in one message by including multiple instructions — Claude will spawn them concurrently. Phase 1 is designed for this.

---

## 2. Execution order — the happy path

```
Step 1.  backend-foundation                                 (serial; ~10–15 min)
Step 2.  All 8 Phase-1 agents in parallel                   (~20–40 min)
Step 3.  shared-projects                                    (serial; ~10 min)
Step 4.  devops + frontend-auth in parallel                 (~15–20 min)
Step 5.  frontend-contract audit                            (~3 min)
Step 6.  Smoke test                                          (~10 min)
```

Total elapsed time: ~1 to 1.5 hours of agent work, more if anything fails.

---

## 3. Step 1 — Foundation

Invoke:

```
Use the backend-foundation agent to scaffold apps/api per PLAN.md. Read db.io and create the Prisma schema with the current_version adjustment. Wire Auth0 JwtStrategy and create empty module stubs for all 11 modules.
```

When it finishes:

1. Open a terminal at the repo root and run:
   ```powershell
   cd apps/api
   npm install                       # if it didn't already
   ```
2. Create `apps/api/.env` (copy from `.env.example`) and paste the **Auth0** values from step 0.3. Leave Stripe placeholders for now.
3. Start a local Postgres (skip if you have one):
   ```powershell
   docker run -d --name webster-pg -e POSTGRES_USER=webster -e POSTGRES_PASSWORD=webster -e POSTGRES_DB=webster -p 5432:5432 postgres:16
   ```
4. Run migrations:
   ```powershell
   npx prisma migrate dev --name initial
   ```
5. Boot the API:
   ```powershell
   npm run start:dev
   ```
6. **Verify:**
   ```powershell
   curl http://localhost:4000/api/health
   ```
   Should return `{"status":"ok"}`. If it doesn't, stop and have the foundation agent fix it before moving on.

---

## 4. Step 2 — Phase 1 (parallel)

Invoke all eight in one message:

```
Run these in parallel:
- Use the nest-module agent to build module A (Users).
- Use the nest-module agent to build module D (Projects).
- Use the nest-module agent to build module G (Accesses).
- Use the nest-module agent to build module H (Comments).
- Use the nest-module agent to build module J (Payments).
- Use the storage-engineer agent to build modules B (Storage), C (Webster), and E (Assets).
- Use the realtime-engineer agent to build modules K (Collaboration) and F (Snapshots).
- Use the stripe-engineer agent to build module I (Subscriptions).
```

While agents run, you can do other things. They will each report back when done.

When they're all done:

1. Restart the API:
   ```powershell
   cd apps/api
   npm run start:dev
   ```
2. **Verify no boot errors.** If the API crashes, check the failing agent's report and re-invoke it with the error message.
3. Spot-check at least one endpoint with curl (it should return `401` because you have no token):
   ```powershell
   curl -i http://localhost:4000/api/users/me
   ```

---

## 5. Step 3 — Shared-projects orchestrator

Invoke:

```
Use the shared-projects agent to build module L (the /api/shared-projects/* orchestrator routes).
```

When done, restart the API. Two endpoints to spot-check:

```powershell
curl -i -X POST http://localhost:4000/api/shared-projects/import-webster
# expect 401 (auth) — confirms route exists
```

---

## 6. Step 4 — Deployment + frontend bridge (parallel)

Invoke both in one message:

```
Run in parallel:
- Use the devops agent to build docker-compose.yml, the Dockerfiles, the MinIO and Postgres init scripts, and the README backend section.
- Use the frontend-auth agent to ship the minimal Auth0 page and the Socket.IO client rewrite in apps/web.
```

After both finish:

1. Create `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_WEBSTER_API_URL=http://localhost:4000/api
   NEXT_PUBLIC_WEBSTER_WS_URL=http://localhost:4000
   NEXT_PUBLIC_AUTH0_DOMAIN=<from step 0.3>
   NEXT_PUBLIC_AUTH0_CLIENT_ID=<from step 0.3>
   NEXT_PUBLIC_AUTH0_AUDIENCE=<from step 0.3>
   NEXT_PUBLIC_AUTH0_REDIRECT_URI=http://localhost:3000/callback
   ```
2. Test the full docker stack:
   ```powershell
   docker compose up --build
   ```
   Wait until all four services are healthy (postgres, minio, api, web). Press Ctrl+C when verified.

---

## 7. Step 5 — Contract audit

Invoke:

```
Use the frontend-contract agent to audit drift between apps/web/src/editor/collaboration and apps/api/src/modules.
```

It produces a markdown report. If any `❌` rows appear, dispatch the named owning agent to fix them, then re-run the audit.

---

## 8. Step 6 — Smoke test (you, not an agent)

Bring the stack up:

```powershell
docker compose up
```

Wait for all four healthchecks to pass. Then in a browser:

1. Go to `http://localhost:3000/login` → click the login button → complete Auth0 flow → land back at the editor.
2. Open a local project, edit something, save it locally (`.webster` file downloads).
3. From the File menu, click **Share project**. The backend uploads, you should be redirected to a shared URL with a `projectId`.
4. Open the same shared URL in a second browser (or incognito window — log in with a second test Auth0 user).
5. Edit in one window (drag a layer, type text). The other window should reflect changes within ~200ms.
6. Create a snapshot from the Versions panel. Restore it. Both windows reload state.
7. From terminal, test Stripe webhooks:
   ```powershell
   stripe listen --forward-to localhost:4000/api/subscriptions/webhook
   # copy the displayed `whsec_...` into your .env as STRIPE_WEBHOOK_SECRET, restart api
   stripe trigger checkout.session.completed
   stripe trigger invoice.paid
   ```
   Check that rows appear in `subscriptions` and `payments` tables (use `psql` or any DB client).

If any of these fail, see Section 9 (recovery).

---

## 9. Recovery — when an agent reports failure

### "Foundation: Prisma migration failed"

- Make sure Postgres is running and the `DATABASE_URL` in `.env` is correct.
- Wipe and retry:
  ```powershell
  docker rm -f webster-pg
  # re-run the docker run command from step 3
  cd apps/api
  npx prisma migrate dev --name initial
  ```

### "Phase-1 agent: cannot find ProjectAccessService"

The agent forgot to inject with `@Optional()`. Re-invoke it with:
```
Re-run yourself. The injection of sibling services MUST use @Optional() per PLAN.md Section 4. Patch your module to inject ProjectAccessService with @Optional() and degrade gracefully when null.
```

### "Realtime: clients can't connect"

Most common: CORS. Open the gateway and confirm `cors.origin` matches `CORS_ORIGIN` env var. Second most common: Auth middleware rejecting the token — check Auth0 audience matches.

### "Frontend: editor doesn't load after Auth0 redirect"

Open browser DevTools → Application → Local Storage. Confirm Auth0 stored tokens. Check Network tab for a failing `GET /me` or 401s — backend tokens won't validate if `AUTH0_AUDIENCE` differs between frontend and backend.

### "Docker: api service crashlooping"

Most common: migrations can't reach Postgres. Confirm `depends_on` has `condition: service_healthy` and the Postgres healthcheck is wired.

### Generic: agent went off-script

Re-invoke with:
```
Re-read PLAN.md Section <X> carefully. You produced <what went wrong>. Roll back any files outside your owned folder list and try again.
```

---

## 10. Updating the plan mid-flight

If you decide to change something (e.g. swap MinIO for Cloudflare R2):

1. Edit `apps/api/PLAN.md` first.
2. Edit the affected agent file in `.claude/agents/` if its scope shifts.
3. Re-invoke the owning agent with: `PLAN.md has been updated — re-read your section and reconcile.`

Do not modify code directly in the working tree. Always go through the plan + agent so the contract stays single-source.

---

## 11. Useful commands cheat sheet

```powershell
# Boot full stack
docker compose up --build

# Boot just dependencies (Postgres + MinIO) for local API dev
docker compose up postgres minio minio-init

# Run API locally with hot reload
cd apps/api ; npm run start:dev

# Run web locally
npm run dev:web

# Apply migrations
cd apps/api ; npx prisma migrate dev

# Reset DB (DESTRUCTIVE)
cd apps/api ; npx prisma migrate reset

# Open Prisma Studio
cd apps/api ; npx prisma studio

# Stripe webhook tunnel
stripe listen --forward-to localhost:4000/api/subscriptions/webhook

# Tail API logs in docker
docker compose logs -f api

# MinIO console
# http://localhost:9001  (login minioadmin / minioadmin)
```

---

## 12. When everything works

Tag and push:

```powershell
git add .
git commit -m "Webster backend fleet build complete"
git tag backend-v1
git push --tags
```

Then hand the deploy off — `docker compose up` against a real host (or convert to Kubernetes manifests, not in scope here).
