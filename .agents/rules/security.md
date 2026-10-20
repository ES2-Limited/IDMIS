---
trigger: model_decision
description: Applies to changes involving authentication, route authorization, permission definitions, personal identity numbers (NIN, BVN), file uploads, and credential or secret management.
---

# Security Controls & Guardrails

## 1. Authentication & Authorization

- All API routes are protected by JWT authentication guards unless explicitly decorated with `@Public()`.
- Every protected endpoint must declare explicit permissions via `@Can('module.resource.action')`. Deny by default.
- Scoping rules are mandatory: repositories must filter records by the authenticated user's assigned `schemeIds` and `stateIds`.

## 2. PII & Identity Protection

- National identity numbers (such as NIN, BVN, tax IDs) must be encrypted at the application layer before writing to the database using AES-256-GCM.
- Never log, display, or return raw unmasked identity numbers in API responses or log statements. Return masked representations only (e.g. `******1234`).
- Any search by identity number must use a deterministic HMAC digest index rather than plaintext queries.

## 3. Secret Management

- Secrets, tokens, and database credentials must only be injected via environment variables.
- Never commit `.env` files or hardcode secrets in source code, configuration files, or test suites.
- Automated secret scanning (Gitleaks) runs on every push and pull request.

## 4. File Upload & S3/MinIO Security

- All file uploads must be validated for allowed MIME types and file extensions (e.g. PDF, PNG, JPG, CSV).
- Generate random UUID keys for stored files; never use user-supplied file names directly in S3 storage paths.
- Serve files via short-lived pre-signed URLs; public bucket access is prohibited.

## 5. Input Sanitization & Audit

- All inputs are strictly validated against `@idmis/contracts` Zod schemas to prevent injection attacks.
- Every mutating write operation must record an entry in `audit_logs` capturing user identity, timestamp, IP address, and payload diff.
