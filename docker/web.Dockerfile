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

# Stage 2: Build
FROM deps AS build
WORKDIR /app

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
