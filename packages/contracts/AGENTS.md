# Contracts Package Guide (`packages/contracts`)

## Source of Truth

`packages/contracts` is the definitive single source of truth for all data shapes, API request/response contracts, validation schemas, and permissions across IDMIS 2.0. Never redefine shapes in `apps/api` or `apps/web`.

## File Organization

- Structure files strictly by module and entity:
  `src/<module>/<entity>.ts` (e.g. `src/slis/farmer.ts`, `src/me/indicator.ts`).
- Barrel exports re-export entity schemas via module index files (`src/<module>/index.ts`) and root index (`src/index.ts`).

## Export Patterns

For every entity or operation, export both the Zod schema and its TypeScript inferred type:

```typescript
import { z } from 'zod';

export const FarmerSchema = z.object({
  id: z.string().uuid(),
  schemeId: z.string().uuid(),
  stateId: z.string().uuid(),
  nationalIdMasked: z.string(),
  version: z.number().int().positive(),
});

export type Farmer = z.infer<typeof FarmerSchema>;

export const CreateFarmerDtoSchema = FarmerSchema.omit({
  id: true,
  version: true,
});
export type CreateFarmerDto = z.infer<typeof CreateFarmerDtoSchema>;
```

## Permission Naming Convention

Permissions must follow the dot-delimited pattern `module.resource.action`:

- Examples: `slis.farmer.create`, `slis.farmer.read`, `me.target.update`, `core.user.manage`.
- Permissions are registered in `src/permissions.ts`.

## Review Requirements

- Because contracts govern API stability, database validation, and UI forms, any changes to `packages/contracts` require explicit review from **both developers** (`@DEV_A` and `@DEV_B`).
