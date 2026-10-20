# ADR 0001: Monorepo Architecture with Turborepo and pnpm Workspaces

## Status

Accepted

## Date

2026-10-20

## Deciders

- Author: @SAIF
- Reviewers: @DEV_A, @DEV_B

## Context & Problem Statement

TRIMING IDMIS 2.0 encompasses multiple interdependent systems: a web application (`apps/web`), an API (`apps/api`), a background worker (`apps/worker`), and shared libraries for contracts, database schemas, and UI design tokens. We needed a repository strategy that guarantees single-source-of-truth contracts while enabling atomic commits and fast builds.

## Decision Drivers

- Contract sharing between frontend and backend without publishing separate packages to an npm registry.
- Atomic cross-application feature commits (e.g. database migration + API + UI in one PR).
- Unified tooling for linting, typechecking, and testing.

## Decision Outcome

Adopted a single monorepo managed with **pnpm workspaces** and **Turborepo**.

- Internal packages use `@idmis/<name>` naming with `workspace:*` dependencies.
- Turborepo pipelines coordinate parallel cached tasks for `build`, `lint`, `typecheck`, and `test`.

### Positive Consequences

- Immediate type safety across client and server when modifying Zod contracts.
- Fast cached builds and PR checks via Turborepo.
- Simplified dependency management and deduplication via pnpm hard links.

### Negative Consequences / Trade-offs

- Requires clear boundary guardrails to prevent accidental tight coupling across packages. Enforced via ESLint boundaries plugin and CODEOWNERS.
