/**
 * Evaluates whether a set of dam component condition ratings meets safety standards.
 *
 * Provisional Rule (see docs/blis-dam-safety-rule.md):
 * - Must evaluate at least 'dam_body' AND 'spillway_1'.
 * - No component condition may have rating 'poor' or 'critical'.
 */
export function calculateMeetsStandard(
  components: Array<{ component: string; ratingCode?: string | null }>,
): boolean {
  if (!components || components.length === 0) {
    return false;
  }

  const ratedComponents = new Set<string>();

  // A component counts as rated only if it has a non-empty ratingCode
  for (const c of components) {
    const code = c.ratingCode?.toLowerCase().trim();
    if (code) {
      ratedComponents.add(c.component);
      if (code === 'poor' || code === 'critical') {
        return false;
      }
    }
  }

  // Must have rated dam_body and spillway_1
  if (!ratedComponents.has('dam_body') || !ratedComponents.has('spillway_1')) {
    return false;
  }

  return true;
}
