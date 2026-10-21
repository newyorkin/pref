FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json

RUN pnpm install --frozen-lockfile

COPY packages packages

RUN pnpm --filter @pref/web build

ENV HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/pref.sqlite \
    STATIC_DIR=/app/packages/web/dist \
    NODE_OPTIONS=--experimental-sqlite

RUN mkdir -p /data

VOLUME /data
EXPOSE 3001

CMD ["pnpm", "--filter", "@pref/server", "start"]
