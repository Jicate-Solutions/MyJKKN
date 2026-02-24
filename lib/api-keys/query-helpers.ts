/**
 * Query Parameter Helpers for api-management routes.
 *
 * Extract and normalize common query parameters (pagination, date ranges,
 * sorting, filtering) from URL search params.
 */

/**
 * Standard pagination parameters.
 * page/limit come from URL, from/to are computed for Supabase .range().
 */
export interface PaginationParams {
  page: number;
  limit: number;
  /** Start index for Supabase .range() */
  from: number;
  /** End index for Supabase .range() (inclusive) */
  to: number;
}

/**
 * Extract pagination params from URL search params.
 * Defaults: page=1, limit=50, max limit=200.
 */
export function getPaginationParams(url: URL): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50),
    200
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { page, limit, from, to };
}

/**
 * Date range filter parameters.
 */
export interface DateRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Extract date range params from URL search params.
 * Accepts both `date_from`/`date_to` and `dateFrom`/`dateTo` formats.
 */
export function getDateRangeParams(url: URL): DateRangeParams {
  const dateFrom =
    url.searchParams.get('date_from') ??
    url.searchParams.get('dateFrom') ??
    undefined;
  const dateTo =
    url.searchParams.get('date_to') ??
    url.searchParams.get('dateTo') ??
    undefined;

  return { dateFrom, dateTo };
}

/**
 * Sort parameters.
 */
export interface SortParams {
  sortBy: string;
  ascending: boolean;
}

/**
 * Extract sort params from URL search params.
 * Defaults: sortBy='created_at', order='desc'.
 */
export function getSortParams(
  url: URL,
  defaultSortBy: string = 'created_at'
): SortParams {
  const sortBy = url.searchParams.get('sort_by') ?? defaultSortBy;
  const order = url.searchParams.get('order') ?? 'desc';
  return { sortBy, ascending: order === 'asc' };
}

/**
 * Extract a single string param, returning undefined if not present.
 */
export function getStringParam(url: URL, key: string): string | undefined {
  return url.searchParams.get(key) ?? undefined;
}

/**
 * Extract a UUID param with basic format validation.
 * Returns undefined if not present or invalid.
 */
export function getUuidParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  if (!value) return undefined;
  // Basic UUID v4 format check
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return undefined;
}
