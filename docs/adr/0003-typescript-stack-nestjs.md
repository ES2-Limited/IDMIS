# ADR 0003: End-to-End TypeScript Stack with NestJS and Fastify

## Status

Accepted

## Date

2026-10-20

## Deciders

- Author: @SAIF
- Reviewers: @DEV_A, @DEV_B

## Context & Problem Statement

We required an end-to-end type-safe development environment across web, API, worker, and background sync, running on Node.js 22 LTS with strong architectural conventions.

## Decision Drivers

- Shared contracts and types between client, server, and worker.
- Robust dependency injection and module architecture for the backend.
- High-throughput HTTP performance for batch synchronization payloads.

## Decision Outcome

Standardized on **TypeScript strict mode everywhere** with:

- **Backend**: NestJS latest using the **Fastify adapter** (`@nestjs/platform-fastify`) for maximum I/O throughput.
- **Validation**: Contract-first Zod validation schemas from `@idmis/contracts` instead of standard NestJS `class-validator` / `ValidationPipe`.
- **Frontend**: React 19 + Vite with TanStack Router, TanStack Query, and Tailwind CSS v4.
- **Worker**: Node.js + BullMQ processing jobs off Redis.

### Positive Consequences

- Zero serialization or translation errors between frontend forms and backend validation.
- Fastify provides 2-3x higher requests/sec compared to default Express.
- NestJS modules map naturally to our modular monolith domain boundaries.

### Negative Consequences / Trade-offs

- Fastify middleware ecosystem differs from Express; requires using `@fastify/*` compatible plugins.
