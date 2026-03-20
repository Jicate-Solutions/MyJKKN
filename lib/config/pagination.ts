// lib/config/pagination.ts
// Pagination utilities and search sanitisation helpers

/**
 * Sanitise a user-provided search string before interpolating it into
 * PostgREST `ilike` / `or` filter expressions.
 *
 * Strips characters that could break or inject into Supabase filter syntax:
 *   - Parentheses, commas, periods (PostgREST operators)
 *   - Percent signs (already added by callers for ilike)
 *   - Back-slashes and quotes
 *
 * Returns the trimmed, sanitised string (may be empty).
 */
export function sanitizeSearch(input: string): string {
  if (!input) return '';
  return input
    .replace(/[%\\'"(),.*]/g, '')
    .trim();
}
