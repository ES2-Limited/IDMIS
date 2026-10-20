# ADR 0002: Modular Monolith Architecture

## Status

Accepted

## Date

2026-10-20

## Deciders

- Author: @SAIF
- Reviewers: @DEV_A, @DEV_B

## Context & Problem Statement

IDMIS 2.0 covers distinct operational domains: Core Administration (`core`), Scheme Land Information System (`slis`), Monitoring & Evaluation (`me`), and Baseline Land Information System (`blis`), with Procurement (`proc`) planned later. We needed an architecture that isolates domain boundaries without the operational overhead of microservices.

## Decision Drivers

- High team velocity for two primary developers.
- Clear domain boundaries and bounded contexts.
- Simplicity of deployment, transactions, and monitoring.
- Option to extract services in the future if required.

## Decision Outcome

Adopted a **Modular Monolith** structure in `apps/api`:

- Modules are strictly segregated in `apps/api/src/modules/<module>`.
- Cross-module communication is ONLY permitted via each module's `public/` directory or asynchronous outbox events.
- Direct cross-module imports of internal repositories, services, or controllers are blocked by ESLint boundary rules.
- Direct cross-schema database joins or foreign keys between business schemas are strictly prohibited.

### Positive Consequences

- Single runtime deployment with zero distributed transaction overhead.
- Clean isolation between modules allowing independent development by `@DEV_A` and `@DEV_B`.
- Strict boundary rules prevent spaghetti code from accumulating.

### Negative Consequences / Trade-offs

- Cross-module data aggregations must be assembled at the application service layer rather than via database joins.
