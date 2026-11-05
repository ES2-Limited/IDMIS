/**
 * Evaluates whether a set of dam component condition ratings meets safety standards.
 *
 * Provisional Rule (see docs/blis-dam-safety-rule.md):
 * - Must evaluate at least 'dam_body' AND 'spillway_1'.
 * - No component condition may have rating 'poor' or 'critical'.
 */
export function calculateMeetsStandard(
  components: Array<{ component: string; ratingCode?: string }>,
): boolean {
  if (!components || components.length === 0) {
    return false;
  }

  const ratedComponents = new Set(components.map((c) => c.component));

  // Must have dam_body and spillway_1
  if (!ratedComponents.has('dam_body') || !ratedComponents.has('spillway_1')) {
    return false;
  }

  // No component rated poor or critical
  for (const c of components) {
    const code = c.ratingCode?.toLowerCase().trim();
    if (code === 'poor' || code === 'critical') {
      return false;
    }
  }

  return true;
}
