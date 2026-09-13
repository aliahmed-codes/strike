# Build context: repo root (so this can install the npm workspace correctly).
# Usage: docker build -f docker/server.Dockerfile .

FROM node:22-slim AS base
WORKDIR /app
# package-lock.json is intentionally NOT copied here: it's generated on
# Windows, and npm's optional-dependency resolution (native bindings for
# @swc/core, rolldown, etc.) doesn't carry over to Linux from a foreign-
# platform lockfile (see https://github.com/npm/cli/issues/4828). Installing
# fresh from just the package.json files lets npm resolve the right
# Linux binaries.
COPY package.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

FROM base AS deps
RUN npm install

FROM base AS deps-prod
RUN npm install --omit=dev

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build --workspace=@strike/shared
RUN npm run build --workspace=server

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production node_modules (workspace-aware, so the @strike/shared
# symlink below resolves correctly).
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=deps-prod /app/package.json ./package.json

# Compiled shared package, at the same relative path the workspace symlink expects.
COPY packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist

# Compiled server app.
COPY --from=build /app/apps/server/build apps/server/build

WORKDIR /app/apps/server/build
EXPOSE 3334
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]
