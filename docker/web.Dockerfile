# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy root workspace manifest
COPY package.json package-lock.json ./

# Copy workspace package manifests
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

# The committed lockfile was generated on Windows, so it only records the
# win32 builds of Tailwind v4's native deps (lightningcss, @tailwindcss/oxide).
# Install the matching linux musl binaries for this Alpine x64 image so the
# CSS pipeline can load them at build time.
RUN npm install --no-save \
      lightningcss-linux-x64-musl@$(node -p "require('lightningcss/package.json').version") \
      @tailwindcss/oxide-linux-x64-musl@$(node -p "require('@tailwindcss/oxide/package.json').version")

# Stage 2: Build
FROM deps AS build
WORKDIR /app

# Next.js inlines NEXT_PUBLIC_* at BUILD time, so they must be passed as build
# args (not runtime env) and exported before `next build`.
ARG NEXT_PUBLIC_WEBSTER_API_URL
ARG NEXT_PUBLIC_WEBSTER_WS_URL
ARG NEXT_PUBLIC_AUTH0_DOMAIN
ARG NEXT_PUBLIC_AUTH0_CLIENT_ID
ARG NEXT_PUBLIC_AUTH0_AUDIENCE
ARG NEXT_PUBLIC_AUTH0_REDIRECT_URI
ENV NEXT_PUBLIC_WEBSTER_API_URL=$NEXT_PUBLIC_WEBSTER_API_URL \
    NEXT_PUBLIC_WEBSTER_WS_URL=$NEXT_PUBLIC_WEBSTER_WS_URL \
    NEXT_PUBLIC_AUTH0_DOMAIN=$NEXT_PUBLIC_AUTH0_DOMAIN \
    NEXT_PUBLIC_AUTH0_CLIENT_ID=$NEXT_PUBLIC_AUTH0_CLIENT_ID \
    NEXT_PUBLIC_AUTH0_AUDIENCE=$NEXT_PUBLIC_AUTH0_AUDIENCE \
    NEXT_PUBLIC_AUTH0_REDIRECT_URI=$NEXT_PUBLIC_AUTH0_REDIRECT_URI

COPY . .

# Build shared package first (web depends on it)
RUN npm run build -w @webster/shared

# Build the Next.js app
RUN npm run build -w @webster/web

# Stage 3: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy Next.js output and static assets
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-p", "3000", "apps/web"]
