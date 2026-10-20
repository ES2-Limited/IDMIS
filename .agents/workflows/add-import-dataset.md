---
description: Add a new tabular dataset import pipeline with validation, template generator, commit, and rollback/undo capabilities.
---

# Add Import Dataset Workflow

1. **Define Import Contract**:
   - In `packages/contracts/src/<module>/imports/<dataset>.import.ts`, declare the row Zod schema.
   - Define expected column headers, types, constraints, and error messages.
   - Register the import dataset identifier in contracts.

2. **Database Schema Integration**:
   - Ensure the target table in `packages/db` has an `import_batch_id: uuid` column to track source batches.

3. **Template & Validator**:
   - Implement the downloadable CSV/Excel template generator in `apps/api/src/modules/<module>/imports/`.
   - Implement row-by-row validation using the contract schema with structured error collection.

4. **Commit & Undo Handlers**:
   - In `apps/api/src/modules/<module>/imports/`, implement `commitBatch(batchId)` to insert valid records atomically and log an audit record.
   - Implement `undoBatch(batchId)` to delete or soft-delete records tagged with the given `import_batch_id`.

5. **Test Coverage**:
   - Write unit tests for the template generator.
   - Write tests for row validation rules (valid records pass, invalid rows yield column-specific errors).
   - Write integration tests for the commit transaction and rollback/undo functionality.
   - Run `pnpm test`.
