/**
 * Pure course-category helpers — safe to import from client components.
 * (The COE fetch/cache lives in `coe-course-categories.ts`, which is server-only
 * because it imports CoeRestClient and its API keys.)
 *
 * Mirrors COE's `lib/ia/course-type-applicability.ts` normalization so both sides
 * classify a course identically.
 */

/** 'Theory + Practical' -> 'theory_practical'; 'Field Work' -> 'field_work'. */
export function normalizeCourseCategory(category?: string | null): string {
  return (category || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * True ONLY for a pure Practical course. EXACT token equality on purpose — a
 * substring test would also match 'theory_practical' ("Theory + Practical"), which
 * has a theory component and must stay visible in the Theory view.
 * Unknown/empty category returns false, so a paper is never wrongly hidden.
 */
export function isPracticalCategory(category?: string | null): boolean {
  return normalizeCourseCategory(category) === 'practical';
}
