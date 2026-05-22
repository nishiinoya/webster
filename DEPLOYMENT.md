# Deployment

This repo has two compose stacks:

- **`docker-compose.yml`** — development. `up` brings up the entire stack in containers (Postgres, MinIO, API, Web).
- **`docker-compose.prod.yml`** — production. Same set of containers but built for a real public deployment behind nginx + TLS.

---

## Local development

Requirements: Node 22 (only needed if you want to run anything outside Docker), Docker Desktop, an Auth0 SPA app (free tier), and an Auth0 API (its Identifier becomes your `audience`).

### 1. Env file

The compose reads `${VAR}` from a root `.env` (gitignored). Create it with your Auth0 values:

```bash
# .env (repo root) — gitignored
AUTH0_DOMAIN=your-tenant.eu.auth0.com
AUTH0_AUDIENCE=https://your-api-identifier
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-spa-client-id

# Stripe (optional in dev — leave empty if you're not testing payments)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
```

Defaults the compose fills in (override only if you need different ones):

| Var | Default |
|---|---|
| `NEXT_PUBLIC_WEBSTER_API_URL` | `http://localhost:4000/api` |
| `NEXT_PUBLIC_WEBSTER_WS_URL` | `http://localhost:4000` |
| `NEXT_PUBLIC_AUTH0_DOMAIN` | falls back to `AUTH0_DOMAIN` |
| `NEXT_PUBLIC_AUTH0_AUDIENCE` | falls back to `AUTH0_AUDIENCE` |
| `NEXT_PUBLIC_AUTH0_REDIRECT_URI` | `http://localhost:3000/callback` |

In your Auth0 SPA settings (matches the defaults above):

- Allowed Callback URLs: `http://localhost:3000/callback`
- Allowed Logout URLs: `http://localhost:3000`
- Allowed Web Origins: `http://localhost:3000`

### 2. Run the stack

**Recommended — hot reload (run infra in Docker, app servers locally):**

```bash
# Terminal 1 — infrastructure only
docker compose up postgres minio minio-init

# Terminal 2 — API with hot reload
cd apps/api && npm run start:dev

# Terminal 3 — frontend with hot reload
cd apps/web && npm run dev
```

This gives you instant feedback on every save for both the API (NestJS watch mode) and the frontend (Next.js fast refresh).

**Alternative — full stack in Docker (no hot reload):**

```bash
docker compose up -d --build
docker compose ps           # postgres, minio, api, web → healthy / up
```

Both API and web are built and run as compiled containers — code changes require a rebuild. Useful for testing the production-like build locally.

> Changed any `NEXT_PUBLIC_*`? Next inlines them at build time — rebuild the web image:
> `docker compose up -d --build web`

### Optional profiles

```bash
# Local Stripe webhook forwarder. Requires STRIPE_SECRET_KEY in .env.
docker compose --profile stripe up -d stripe-cli
```

### Useful

- MinIO console: `http://localhost:9001` (`minioadmin` / `minioadmin`)
- Postgres: `psql postgresql://webster:webster@localhost:5432/webster`
- Tail logs: `docker compose logs -f api` (or `web`)
- Tear down: `docker compose down` (data persists in named volumes)
- Reset DB: `docker compose exec api npx prisma migrate reset`

---

## Production

Assumes a Linux server with Docker + Compose, and nginx + certbot already installed.
Two public subdomains: `app.yourdomain.com` (web) and `api.yourdomain.com` (API).

### 1. Configure

```bash
git clone <repo> && cd webster
cp .env.production.example .env.production
nano .env.production    # fill in everything (DB/MinIO passwords, Auth0, Stripe live keys)
```

- **Auth0** (SPA app): add to Allowed Callback URLs `https://app.yourdomain.com/callback`,
  Logout URLs `https://app.yourdomain.com`, Web Origins `https://app.yourdomain.com`.
- **Stripe**: dashboard → Webhooks → add endpoint `https://api.yourdomain.com/api/subscriptions/webhook`,
  copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

### 2. Launch the stack (Postgres, MinIO, API, web)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

This starts Postgres + MinIO (bound to `127.0.0.1` only), runs Prisma migrations automatically on API
boot, and serves the API on `127.0.0.1:4000` and the web on `127.0.0.1:3000`.
Postgres data persists in the `postgres_data` volume; assets in `minio_data`.

Check it's up:

```bash
docker compose -f docker-compose.prod.yml ps
curl -s http://localhost:4000/api/health   # {"status":"ok"}
```

> Changed `NEXT_PUBLIC_*` later? The web bakes them in at build time — rebuild:
> `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build web`

### 3. nginx + TLS

`/etc/nginx/sites-available/webster`:

```nginx
server {
    server_name app.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    server_name api.yourdomain.com;
    client_max_body_size 50M;            # project/.webster uploads
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Socket.IO realtime collaboration needs the WebSocket upgrade
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/webster /etc/nginx/sites-enabled/
certbot --nginx -d app.yourdomain.com -d api.yourdomain.com
nginx -t && systemctl reload nginx
```

certbot adds the `:443` TLS blocks and redirects `:80` automatically.

### 4. Verify

- `https://app.yourdomain.com` → login via Auth0 → editor loads
- Share a project, open it in a second browser → live edits propagate (WebSocket)
- `stripe trigger invoice.paid` (or a real test purchase) → row appears in `payments`

### Updating later

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run automatically on API boot. To inspect the DB:

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```
