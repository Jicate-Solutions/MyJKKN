/**
 * `pde_submissions.answers` has TWO shapes in production.
 *
 *   Pre-scoring   → a plain ARRAY of per-question answer envelopes.
 *   Post-scoring  → `{ items: [...], osce_score: {...} }`, written by the OSCE
 *                   write-back in app/api/pde/clinical-reasoning/score/route.ts.
 *
 * The object shape only started reaching the column with PR #2629, which moved
 * that write-back onto the service-role client. Before it, the UPDATE silently
 * matched zero rows (pde_submissions has RLS enabled with INSERT + SELECT
 * policies and NO UPDATE policy), so every reader ever written against this
 * column only ever saw the array. From the first scored clinical case onward,
 * both shapes are live at the same time.
 *
 * Readers that do not normalise fail in one of two ways:
 *
 *   `answers || []`                         an object is TRUTHY, so the fallback
 *                                           never fires and `for...of` over a
 *                                           non-iterable throws a TypeError.
 *
 *   `Array.isArray(a) ? a : []`             an object yields an EMPTY array, so
 *                                           scored submissions silently vanish
 *                                           from counts with no error anywhere.
 *
 * Semantics here are identical to the reader that already handled both shapes:
 * app/(routes)/pde/learn/cases/[caseSlug]/summary/[attemptId]/page.tsx.
 *
 * @param raw the raw `answers` value straight off a pde_submissions row
 * @returns the answers array for either shape; `[]` for anything else
 */
export function toAnswersArray<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const items = (raw as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}
