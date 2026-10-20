---
trigger: glob
globs:
  - 'apps/web/**'
  - 'packages/ui/**'
---

# Web & UI Guidelines (`apps/web` & `packages/ui`)

## 1. Modular Organization

- Feature components are contained in `apps/web/src/modules/<module>/` matching backend domains (`core`, `slis`, `me`, `blis`).
- App shell, primary navigation, and headers live in `src/shell/`.
- Mobile-first field data collection forms live in `src/field/`.
- Offline persistence and sync workers live in `src/offline/` and `src/sw/`.
- Common UI components, primitives, layout templates, and status indicators belong in `packages/ui/`.

## 2. Design System & Styling

- Use Tailwind CSS v4 design tokens exclusively. Hardcoding arbitrary hex values (e.g. `bg-[#123456]`) or raw pixel values is forbidden.
- Use reusable components exported from `@idmis/ui` (buttons, inputs, cards, dialogs, badges, status chips).
- Status chips (e.g. `draft`, `submitted`, `verified`, `rejected`, `sync_held`) must use centralized status variants defined in `@idmis/ui/tokens`.

## 3. Data Fetching & Mutations

- All server interaction must use TanStack Query hooks.
- All HTTP requests must use `@idmis/api-client`.
- Manage query keys strictly by domain resource (e.g. `['slis', 'farmers', { schemeId }]`).
- Mutations must invalidate affected query keys upon success.

## 4. Accessibility (A11y)

- All interactive controls (buttons, links, form inputs) must have accessible labels (`aria-label` or visible `<label>`).
- Maintain minimum 48x48px touch targets for mobile usability across all field collection screens.
- Ensure clear visible focus indicators (`focus-visible:ring-2`) on keyboard navigation.
- Use semantic HTML tags (`<main>`, `<nav>`, `<article>`, `<section>`, `<header>`, `<footer>`).

## 5. UI States

Every data list or table must explicitly handle all 4 states:

1. **Loading state**: Skeleton loaders that preserve layout geometry.
2. **Empty state**: Clear informative illustration, explanatory copy, and a primary call-to-action when creation is permitted.
3. **Error state**: Actionable message with a retry button using RFC 9457 error details if available.
4. **Data state**: Clean, paginated, responsive display with accessibility labels.
