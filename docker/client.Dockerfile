# Build context: repo root. Usage: docker build -f docker/client.Dockerfile .

FROM node:22-slim AS base
WORKDIR /app
# package-lock.json intentionally not copied — see docker/server.Dockerfile.
COPY package.json ./
COPY apps/client/package.json apps/client/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM base AS build
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN npm run build --workspace=@strike/shared
RUN npm run build --workspace=client

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
