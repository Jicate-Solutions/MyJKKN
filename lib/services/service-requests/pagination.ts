/**
 * Pagination normalisation for the service-requests module.
 *
 * Every list endpoint here used to inline `filters?.limit || 20`, which meant
 * a caller asking for more rows was silently capped at 20 and a garbage param
 * (`parseInt('abc')` -> NaN) reached PostgREST's `.range(NaN, NaN)`. This
 * centralises the rules so the API routes and the services agree.
 *
 * @module services/service-requests/pagination
 */

/** Page size used when the caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Upper bound on rows per request. Matches the largest option in the shared
 * DataTable page-size selector (components/ui/data-table.tsx), so the UI can
 * never ask for a window the API refuses to serve.
 */
export const MAX_PAGE_SIZE = 500;

export interface NormalizedPagination {
  page: number;
  limit: number;
}

/** Coerce to a positive integer, or `fallback` when the input is unusable. */
function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const truncated = Math.trunc(n);
  return truncated < 1 ? fallback : truncated;
}

/**
 * Normalise caller-supplied paging params into a safe `{ page, limit }`.
 *
 * - `page` is at least 1.
 * - `limit` is at least 1 and at most {@link MAX_PAGE_SIZE}.
 * - NaN / undefined / null fall back to page 1 and {@link DEFAULT_PAGE_SIZE}.
 */
export function normalizePagination(
  page?: number | null,
  limit?: number | null
): NormalizedPagination {
  // A caller explicitly asking for 0 or a negative size wants the smallest
  // legal window, not the default — only unusable input gets the default.
  const rawLimit = Number(limit);
  const limitFallback =
    Number.isFinite(rawLimit) && Math.trunc(rawLimit) < 1 ? 1 : DEFAULT_PAGE_SIZE;

  return {
    page: toPositiveInt(page, 1),
    limit: Math.min(toPositiveInt(limit, limitFallback), MAX_PAGE_SIZE),
  };
}

/**
 * Read `page` / `limit` off a URL's search params and normalise them.
 * Keeps every service-requests route parsing paging identically.
 */
export function paginationFromSearchParams(
  searchParams: URLSearchParams
): NormalizedPagination {
  const rawPage = searchParams.get('page');
  const rawLimit = searchParams.get('limit');
  return normalizePagination(
    rawPage === null ? undefined : Number(rawPage),
    rawLimit === null ? undefined : Number(rawLimit)
  );
}
