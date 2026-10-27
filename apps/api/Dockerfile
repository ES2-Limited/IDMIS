# Stage 1: Build Application and Database Artifacts
FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# Layer caching: copy workspace manifests first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/sync/package.json ./packages/sync/
COPY packages/ui/package.json ./packages/ui/

# Install full workspace dependencies for build stage (NODE_ENV unset)
RUN pnpm install --frozen-lockfile

# Copy source trees needed for building api and db
COPY apps/api ./apps/api
COPY packages ./packages

# Build api and db artifacts
RUN pnpm turbo run build --filter=@idmis/api --filter=@idmis/db

# Prune devDependencies to keep only production dependencies
RUN pnpm prune --prod --no-optional

# Stage 2: Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace package manifests
COPY --chown=node:node package.json pnpm-workspace.yaml ./
COPY --chown=node:node apps/api/package.json ./apps/api/
COPY --chown=node:node packages/db/package.json ./packages/db/
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/

# Copy pruned production node_modules from builder
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node --from=builder /app/packages/db/node_modules ./packages/db/node_modules

# Copy built application and database artifacts (for app runtime + pre-deploy migrate/seed)
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/packages/db/dist ./packages/db/dist
COPY --chown=node:node packages/db/migrations ./packages/db/migrations

USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
