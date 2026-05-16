# Webster Subagents

Each agent below owns a slice of the backend (or the minimal frontend bridge). The full implementation plan lives at [`apps/api/PLAN.md`](../../apps/api/PLAN.md) — agents reference it for specs and contracts.

## Roster

| Agent | Owns | When to invoke |
|---|---|---|
| `backend-foundation` | `apps/api` scaffold, Prisma schema, Auth0 wiring, common infra, empty module stubs | ONCE, first. Blocks everyone. |
| `nest-module` | One of: Users (A), Projects (D), Accesses (G), Comments (H), Payments (J) | After foundation. Invoke once per module letter. Parallel-safe. |
| `storage-engineer` | Storage (B), Webster zip (C), Assets (E) | After foundation. Parallel-safe with other Phase-1 agents. |
| `realtime-engineer` | Collaboration gateway (K), Snapshots (F) | After foundation. Parallel-safe. |
| `stripe-engineer` | Subscriptions (I) and the event-emit contract that Payments (J) consumes | After foundation. Parallel-safe. |
| `shared-projects` | Phase-2 orchestrator (L) — `/api/shared-projects/*` routes | After B, C, D, E, F, K all done. |
| `devops` | docker-compose, Dockerfiles, MinIO/Postgres init | After Phase-2 backend code is in place. |
| `frontend-auth` | Minimal Auth0 page + Socket.IO client rewrite in `apps/web` | Any time after foundation. The other frontend dev owns everything else on the frontend. |
| `frontend-contract` | Read-only audit of REST/WS contract drift between frontend and backend | Anytime; run after each module ships. |

## Recommended execution order

```
1. backend-foundation                                     (serial, must finish first)
2. nest-module(A), nest-module(D), nest-module(G),
   nest-module(H), nest-module(J),
   storage-engineer(all), realtime-engineer,
   stripe-engineer                                        (all parallel)
3. shared-projects                                        (after step 2 done)
4. devops, frontend-auth                                  (parallel, after step 3)
5. frontend-contract                                      (audit; can run anytime)
```

## Rules every agent follows

- Read `apps/api/PLAN.md` first, only your section in detail.
- Own exactly the files listed in your agent definition. Do not touch anything else.
- Cross-module access goes through exported services (`StorageService`, `WebsterPackageService`, `ProjectAccessService`, `RoomService`) injected with `@Optional()` for resilience.
- Never modify `app.module.ts` after foundation finishes — every module stub is already imported.
- Report back what you built, what you tested, and any drift you noticed.
