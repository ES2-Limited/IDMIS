---
description: Create, inspect, test, and document a Drizzle database migration safely.
---

# Database Migration Workflow

1. **Edit Schema**:
   - Update table definitions in `packages/db/src/schema/<module>.ts`.
   - Maintain additive-first principles (backward compatibility for one release cycle).
   - Ensure all standard audit fields and scope indexes are included.

2. **Generate Migration**:
   - Run `pnpm db:generate`.
   - Drizzle Kit will generate a new `.sql` file in `packages/db/migrations/`.

3. **Review SQL**:
   - Inspect the generated SQL file manually.
   - Verify that column additions are either nullable or have safe defaults.
   - Check that no destructive commands (`DROP COLUMN`, `DROP TABLE`) were inadvertently generated.

4. **Run Locally**:
   - Apply the migration to the local development database: `pnpm db:migrate`.
   - Validate that existing queries and applications operate without errors.

5. **Document Rollback**:
   - Add a rollback note in the migration folder or pull request description explaining how to reverse the change if a deployment aborts.
