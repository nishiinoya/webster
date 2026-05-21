# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy root workspace manifest
COPY package.json package-lock.json ./

# Copy workspace package manifests so npm ci resolves workspaces correctly
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

# Stage 2: Build
FROM deps AS build
WORKDIR /app

# Copy full source after deps are installed
COPY . .

# Build shared package first (api depends on it)
RUN npm run build -w @webster/shared

# Generate the Prisma client (schema is only available now, after the full source copy)
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Build the API
RUN npm run build -w @webster/api

# Stage 3: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output
COPY --from=build /app/apps/api/dist ./dist

# Copy Prisma schema and generated client
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./package.json

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/apps/api/src/main.js"]
