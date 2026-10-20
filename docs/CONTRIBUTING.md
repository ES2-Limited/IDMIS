# Contributing to TRIMING IDMIS 2.0

## Branch Naming Convention

Branches must adhere to the following naming pattern:

- `feat/<scope>-<short-description>` (e.g. `feat/slis-farmer-registry`)
- `fix/<scope>-<short-description>` (e.g. `fix/api-version-conflict`)
- `chore/<scope>-<short-description>` (e.g. `chore/infra-guardrails`)

Permitted scopes: `core`, `slis`, `me`, `blis`, `web`, `api`, `worker`, `db`, `contracts`, `ui`, `sync`, `infra`.

---

## PR Size & Commit Guidelines

- **Small PRs**: Aim for under 400 changed lines per pull request to keep code reviews fast and thorough.
- **Commit Messages**: Follow the Conventional Commits specification:
  `<type>(<scope>): <subject>`
  - Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.
  - Example: `feat(slis): add farmer registration endpoint`.

---

## Review & Merge Workflow

1. **Rebase on `main`**: Always rebase your branch on the latest `origin/main` prior to requesting final review.
2. **Squash and Merge**: Pull requests are merged using **Squash and merge** with clean, conventional commit messages.
3. **Review Assignments**:
   - Areas owned by `@DEV_A` are reviewed by `@DEV_B`.
   - Areas owned by `@DEV_B` are reviewed by `@DEV_A`.
   - All `packages/contracts/` changes require sign-off from **both `@DEV_A` and `@DEV_B`**.
4. **Mandatory Review by `@SAIF` (Lead/Reviewer)**:
   - Authentication & JWT handling
   - Permission definitions and access guards
   - Offline sync protocol & conflict handling
   - Tabular dataset import engines (commit/undo)
   - Database migrations on existing tables
   - Changes to `.github/`, `.agents/`, or root governance configs.

---

## How to Raise an Architectural Decision (ADR)

When proposing an architectural shift, new pattern, or major technology addition:

1. Copy `docs/adr/0000-template.md` to `docs/adr/XXXX-<title>.md`.
2. Document the context, decision, and consequences.
3. Submit as a PR for team review and alignment with `@SAIF`.
