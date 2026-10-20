---
description: Systematically diagnose, reproduce, fix, and verify failed GitHub Actions CI jobs.
---

# Fix CI Failure Workflow

1. **Inspect Failing Job**:
   - Run `gh run list` to locate the failing workflow ID.
   - Run `gh run view <run-id> --log-failed` to examine the precise error and stack trace.

2. **Identify Category**:
   - **Secret Scanning (Gitleaks)**: High-severity finding. Remove offending secret from git history immediately and rotate credentials.
   - **Format (Prettier)**: Run `pnpm format` locally.
   - **Lint**: Run `pnpm lint` and inspect module boundary or code rule failures.
   - **Typecheck**: Run `pnpm typecheck` to locate TypeScript strict errors.
   - **Test**: Run `pnpm test` locally to reproduce failing test assertions.
   - **Build**: Run `pnpm build` to identify compilation or bundling errors.

3. **Reproduce Locally**:
   - Execute the single failing target command in isolation (e.g. `pnpm --filter @idmis/api test`).
   - Debug and apply the fix.

4. **Verify All Workspace Checks**:
   - Re-run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` across the entire monorepo.

5. **Push and Re-verify**:
   - Commit the fix with a conventional commit message (e.g. `fix(ci): resolve type error in farmer service`).
   - Push to branch and observe the new GitHub Actions workflow with `gh run watch`.
