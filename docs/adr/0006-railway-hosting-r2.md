# ADR 0006: Cloud Infrastructure with Railway and Cloudflare R2

## Status

Accepted

## Date

2026-10-20

## Deciders

- Author: @SAIF
- Reviewers: @DEV_A, @DEV_B

## Context & Problem Statement

IDMIS 2.0 requires resilient cloud hosting for its API container, background worker, managed PostgreSQL + PostGIS database, and Redis instances, as well as scalable, cost-effective object storage for document and photo attachments.

## Decision Drivers

- Fast developer deployment velocity with minimal DevOps overhead.
- Ephemeral preview environments for pull requests.
- Zero egress fees for large document and photo transfers.
- S3-compatible API for storage.

## Decision Outcome

Standardized on:

- **Application & Service Hosting**: **Railway** (running `apps/api`, `apps/worker`, PostgreSQL 16 with PostGIS, and Redis 7).
- **Object Storage**: **Cloudflare R2** (S3-compatible API, zero egress bandwidth fees).
- Local development parity maintained via `infra/compose.dev.yml` (PostGIS, Redis, MinIO).

### Positive Consequences

- Unified deployment pipeline configured in `infra/railway/`.
- Zero egress fee predictability on Cloudflare R2 for field photo uploads and PDF report downloads.
- Strict S3 API compatibility allowing seamless switching between local MinIO and production R2.

### Negative Consequences / Trade-offs

- R2 requires standard AWS S3 SDK configuration with custom endpoint URLs and credentials.
