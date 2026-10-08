import { getErrorMessage } from '@/lib/utils';

/**
 * Turns the rejected results of a bulk delete into a short reason, e.g.
 * `still used in "admission_leads", "sections"`. Supabase errors are plain
 * objects, so a foreign-key block (23503) is read from `details` rather than
 * an Error instance.
 */
export function summarizeDeleteFailures(
  results: PromiseSettledResult<unknown>[]
): string {
  const usedIn = new Set<string>();
  const other = new Set<string>();

  for (const r of results) {
    if (r.status !== 'rejected') continue;
    const err = r.reason as
      | { code?: string; details?: string; message?: string }
      | undefined;
    if (err?.code === '23503') {
      const table = /table "([^"]+)"/.exec(err.details ?? err.message ?? '')?.[1];
      if (table) usedIn.add(`"${table}"`);
      else other.add('still referenced by other records');
    } else {
      other.add(getErrorMessage(r.reason));
    }
  }

  const parts = [...other];
  if (usedIn.size > 0) parts.unshift(`still used in ${[...usedIn].join(', ')}`);
  return parts.join('; ');
}
