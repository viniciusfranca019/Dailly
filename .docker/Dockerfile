# syntax=docker/dockerfile:1
#
# The dailly image (card #61): the API, the built screen and the MCP in one
# process tree, served on one origin. Built from a git ref by `make image`
# (`git archive`), never from the working folder, and never pushed anywhere.
# Everything Docker of this repo lives in `.docker/`, as in the Workstation; the
# build context is still the repo root (`docker build -f .docker/Dockerfile`).
#
# The diary is not in here: it lives in /data (DAILLY_DB), a volume the
# Workstation deamon binds to ~/.config/dailly. Inside the container the bind is
# 0.0.0.0, because the port is only reachable as Docker publishes it, and the
# deamon publishes it on 127.0.0.1 alone. The Host guard still holds (ADR 0012).
#
# The modules are the ones `make start` turns on: the flags are build time.

# Node 24 on Debian slim, pinned by tag and digest (2026-07-14).
ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS build
# better-sqlite3 compiles its addon when no prebuilt one fits.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN VITE_REQUESTS=true VITE_TASKS=true pnpm --filter @dailly/ui build

FROM ${NODE_IMAGE}
WORKDIR /app
COPY --from=build --chown=node:node /app /app
COPY --chmod=755 .docker/dailly-mcp /usr/local/bin/dailly-mcp
RUN mkdir -p /data && chown node:node /data
ENV DAILLY_HOST=0.0.0.0 \
    DAILLY_PORT=4318 \
    DAILLY_DB=/data/dailly.sqlite \
    DAILLY_UI_DIR=/app/ui/dist \
    DAILLY_API_URL=http://127.0.0.1:4318
VOLUME /data
EXPOSE 4318
USER node
CMD ["/app/server/node_modules/.bin/tsx", "server/src/dev.ts"]
