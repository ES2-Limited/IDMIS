---
description: Prepare a pull request by verifying checks locally, auditing owned boundaries, and completing the PR template.
---

# Pre-PR Quality & Boundary Check

1. **Run Local Automated Verification**:
   - `pnpm lint` (ensure zero ESLint warnings and no module boundary violations)
   - `pnpm typecheck` (ensure strict TypeScript compiles across all workspaces)
   - `pnpm test` (ensure all unit and integration test suites pass)
   - `pnpm build` (verify Vite and Node production builds succeed)
   - `pnpm format:check` (verify Prettier style conforms)

2. **Check Domain Ownership**:
   - Review files modified in the branch against `docs/ownership.md` and `.github/CODEOWNERS`.
   - If files were touched outside your assigned primary area (e.g. `@DEV_A` touching `slis` or `@DEV_B` touching `blis`), make explicit note of these files in the PR description.
   - Tag the responsible domain owner for mandatory review.

3. **Check Decision Changes**:
   - If architectural design patterns were altered, check that an Architecture Decision Record (ADR) was added or updated under `docs/adr/`.

4. **Complete PR Template**:
   - Copy and fill out `.github/PULL_REQUEST_TEMPLATE.md` thoroughly.
   - Ensure all checklist items are ticked and linked issue references are provided.
