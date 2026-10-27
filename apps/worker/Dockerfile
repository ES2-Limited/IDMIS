# Stage 1: Build Worker Application
FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# Layer caching: copy workspace manifests first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/sync/package.json ./packages/sync/
COPY packages/ui/package.json ./packages/ui/

# Install full workspace dependencies for build stage (NODE_ENV unset)
RUN pnpm install --frozen-lockfile

# Copy worker and package sources
COPY apps/worker ./apps/worker
COPY packages ./packages

# Build worker
RUN pnpm turbo run build --filter=@idmis/worker

# Prune devDependencies to keep only production dependencies
RUN pnpm prune --prod --no-optional

# Stage 2: Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace package manifests
COPY --chown=node:node package.json pnpm-workspace.yaml ./
COPY --chown=node:node apps/worker/package.json ./apps/worker/

# Copy pruned production node_modules from builder
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

# Copy built application artifacts
COPY --chown=node:node --from=builder /app/apps/worker/dist ./apps/worker/dist

USER node

CMD ["node", "apps/worker/dist/main.js"]
