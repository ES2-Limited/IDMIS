---
trigger: glob
globs:
  - 'packages/contracts/**'
---

# Contracts Guidelines (`packages/contracts`)

## 1. Role as Single Source of Truth

- `packages/contracts` holds all data schemas, DTOs, API contracts, permissions, and import structures.
- No other package or application is allowed to define alternate shapes for the same domain entity.

## 2. Directory Structure

```
packages/contracts/src/
├── permissions.ts       # Registry of all permission strings
├── index.ts            # Root barrel export
├── core/               # Core module contracts and DTOs
├── slis/               # SLIS module contracts and DTOs
├── me/                 # M&E module contracts and DTOs
└── blis/               # BLIS module contracts and DTOs
```

## 3. Schema & Inferred Type Patterns

- Always export both the Zod schema and its inferred TypeScript type.
- Entity schema names use PascalCase (e.g. `SchemeSchema`).
- Inferred type names match the entity name (e.g. `export type Scheme = z.infer<typeof SchemeSchema>;`).
- DTO schemas explicitly omit system-managed fields (e.g. `id`, `version`, `createdAt`, `updatedAt`).

## 4. Permission Conventions

- Permissions must follow `module.resource.action` dot notation (e.g. `slis.farmer.create`, `me.report.export`).
- Every permission string is declared as a `const` in `src/permissions.ts`.

## 5. Review Requirements

- Any addition, deprecation, or alteration in `packages/contracts` requires review and sign-off from **both developers** (`@DEV_A` and `@DEV_B`) before merging.
