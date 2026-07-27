# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1


FROM base AS dependencies

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci


FROM dependencies AS builder

COPY . .

# Les variables NEXT_PUBLIC_* sont intégrées aux bundles client par Next.js.
# Elles restent aussi définies à l'exécution dans compose.yaml.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_ASSO_NAME="APEL Notre Dame des Flots"
ARG NEXT_PUBLIC_SCHOOL_NAME="École Notre Dame des Flots"
ARG NEXT_PUBLIC_CONTACT_EMAIL=""
ARG NEXT_PUBLIC_ASSOCIATION_RNA=W853001441

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ASSO_NAME=$NEXT_PUBLIC_ASSO_NAME \
    NEXT_PUBLIC_SCHOOL_NAME=$NEXT_PUBLIC_SCHOOL_NAME \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL \
    NEXT_PUBLIC_ASSOCIATION_RNA=$NEXT_PUBLIC_ASSOCIATION_RNA

RUN npm run build


FROM base AS production-dependencies

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev && npm cache clean --force


FROM base AS runner

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    UPLOADS_DIR=/app/data/uploads

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs \
    && mkdir -p /app/data/config /app/data/uploads \
    && chown -R nextjs:nodejs /app/data

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/scheduler.mjs ./scripts/scheduler.mjs
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --chown=nextjs:nodejs --chmod=755 docker/entrypoint.sh ./docker/entrypoint.sh

USER nextjs

EXPOSE 3000

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
