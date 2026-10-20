# TRIMING IDMIS 2.0 (`idmis`)

A modular monorepo scaffolding for the TRIMING IDMIS 2.0 system.

## Prerequisites

- **Node.js**: `22.x` LTS (managed via `.nvmrc`)
- **pnpm**: `^12.14.0`
- **Docker & Docker Compose**: For local development services (PostgreSQL/PostGIS, Redis, MinIO)

## Setup Steps

1. **Clone repository and install dependencies**:

   ```bash
   pnpm install
   ```

2. **Environment configuration**:

   ```bash
   cp .env.example .env
   ```

3. **Start local services (Docker)**:

   ```bash
   pnpm services:up
   ```

   To stop services:

   ```bash
   pnpm services:down
   ```

4. **Build, check types, and lint**:
   ```bash
   pnpm build
   pnpm typecheck
   pnpm lint
   ```

## How to Run Each App

- **Run all apps in dev mode**:

  ```bash
  pnpm dev
  ```

- **Run Web (`apps/web`)**:

  ```bash
  pnpm --filter @idmis/web dev
  ```

  Accessible at [http://localhost:5173](http://localhost:5173).

- **Run API (`apps/api`)**:

  ```bash
  pnpm --filter @idmis/api dev
  ```

  Accessible at [http://localhost:3000](http://localhost:3000) (Health check: `GET http://localhost:3000/health`).

- **Run Worker (`apps/worker`)**:

  ```bash
  pnpm --filter @idmis/worker dev
  ```

  Connects to BullMQ queue connection read from `REDIS_URL`.

- **Database scripts**:
  ```bash
  pnpm db:generate
  pnpm db:migrate
  ```

## Folder Structure

```
idmis/
├── apps/
│   ├── api/ - NestJS API application using Fastify adapter
│   │   └── src/
│   │       ├── platform/ - Cross-cutting infrastructure and platform-level setup
│   │       ├── sync/ - Data synchronization handlers and sync orchestration
│   │       ├── imports/ - File import engines and tabular data ingestion pipelines
│   │       └── modules/ - Domain business modules
│   │           ├── core/ - Core domain module (shared identity, config, core data)
│   │           │   ├── public/ - Public API exported for consumption by other modules
│   │           │   ├── controllers/ - HTTP route controllers
│   │           │   ├── services/ - Core business logic and use cases
│   │           │   ├── repositories/ - Data access layer and entity queries
│   │           │   ├── subscribers/ - Event listeners and message subscribers
│   │           │   └── imports/ - Core-specific data import handlers
│   │           ├── slis/ - SLIS domain module
│   │           │   ├── public/ - Public API exported for consumption by other modules
│   │           │   ├── controllers/ - HTTP route controllers
│   │           │   ├── services/ - SLIS business logic
│   │           │   ├── repositories/ - SLIS data access layer
│   │           │   ├── subscribers/ - SLIS event listeners
│   │           │   └── imports/ - SLIS-specific import handlers
│   │           ├── me/ - M&E (Monitoring and Evaluation) domain module
│   │           │   ├── public/ - Public API exported for consumption by other modules
│   │           │   ├── controllers/ - HTTP route controllers
│   │           │   ├── services/ - M&E business logic
│   │           │   ├── repositories/ - M&E data access layer
│   │           │   ├── subscribers/ - M&E event listeners
│   │           │   └── imports/ - M&E data import handlers
│   │           └── blis/ - BLIS domain module
│   │               ├── public/ - Public API exported for consumption by other modules
│   │               ├── controllers/ - HTTP route controllers
│   │               ├── services/ - BLIS business logic
│   │               ├── repositories/ - BLIS data access layer
│   │               ├── subscribers/ - BLIS event listeners
│   │               └── imports/ - BLIS-specific import handlers
│   ├── web/ - React + Vite frontend application
│   │   └── src/
│   │       ├── app/ - Application bootstrapping, router, and query client provider
│   │       ├── shell/ - Application layout chrome, navigation, headers, and sidebars
│   │       ├── field/ - Mobile field data collection forms and viewports
│   │       ├── modules/ - Feature modules corresponding to backend domains
│   │       │   ├── core/ - Web core shared domain UI and workflows
│   │       │   ├── slis/ - SLIS UI views and interactions
│   │       │   ├── me/ - M&E dashboards and reporting interfaces
│   │       │   └── blis/ - BLIS laboratory and inspection UI
│   │       ├── imports/ - Client-side import wizards and upload previews
│   │       ├── offline/ - Offline-first caching, storage, and synchronization logic
│   │       ├── sw/ - Service worker definitions and lifecycle handlers
│   │       └── i18n/ - Localization resources and translation configurations
│   └── worker/ - Node.js background worker application
│       └── src/
│           └── jobs/ - Background task definitions, handlers, and BullMQ processors
├── packages/
│   ├── api-client/ - Shared HTTP/RPC API client package for web and external consumers
│   ├── config/ - Shared TypeScript configurations, ESLint flat config, and Prettier rules
│   ├── contracts/ - Zod schemas, data contracts, and permission definitions
│   ├── db/ - Drizzle ORM database client, schema definitions, and migration files
│   ├── sync/ - Shared data sync protocols and conflict resolution algorithms
│   └── ui/ - Shared UI component library and design system tokens
├── tests/
│   ├── e2e/ - End-to-end browser integration tests
│   └── load/ - Performance, stress, and load testing scripts
├── infra/
│   ├── docker/ - Dockerfiles and container configurations for services
│   └── railway/ - Deployment manifests and configuration for Railway
└── docs/
    ├── adr/ - Architecture Decision Records documenting key design choices
    └── runbooks/ - Operational runbooks and maintenance guides for production
```
