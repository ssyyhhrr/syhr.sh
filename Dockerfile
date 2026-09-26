# syntax=docker/dockerfile:1

# The Node base image. Override to pin a digest, or to use a base that trusts a company proxy's
# CA (`docker build --build-arg NODE_IMAGE=...`).
ARG NODE_IMAGE=node:24-slim

# Build stage: install everything and bundle the browser assets into dist/.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies (Hono only), the server's TypeScript, which Node 24
# runs directly, and the built assets. No compiler, no dev tools.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/syhr.db
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src/core ./src/core
COPY src/content ./src/content
COPY src/server ./src/server
COPY src/cli ./src/cli
COPY public ./public
COPY --from=build /app/dist ./dist
# The database lives on a volume owned by the unprivileged `node` user, and `syhr` (the admin
# command) is on PATH for `docker exec`.
RUN mkdir -p /data && chown node:node /data \
    && ln -s /app/src/cli/main.ts /usr/local/bin/syhr
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/server/main.ts"]
