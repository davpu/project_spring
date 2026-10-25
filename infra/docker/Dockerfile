# Images for the production stack. Build context is the repository root, and each
# image is a target of this file:
#   docker build -f infra/docker/Dockerfile --target api -t spring-api .   (default)
#   docker build -f infra/docker/Dockerfile --target web -t spring-web .
# The api image also runs the migrations (see docker-compose.prod.yml).

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
ENV NX_DAEMON=false
RUN pnpm nx run-many -t build -p api web

# Production dependencies of the API only, without the web app's or the tooling's.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY libs/db/package.json libs/db/
COPY libs/shared/package.json libs/shared/
RUN pnpm install --frozen-lockfile --prod --filter @org/api...

# The web app's static files with Caddy, which also does the TLS and proxies /api to the API.
FROM caddy:2 AS web
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

FROM node:24-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
# The workspace libraries are bundled into main.js; only the npm packages are loaded at runtime.
COPY --from=build /app/apps/api/dist apps/api/dist
COPY libs/db/migrations libs/db/migrations
COPY infra/docker/migrate.mjs migrate.mjs
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
