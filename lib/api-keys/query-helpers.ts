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
 * ISO date format: YYYY-MM-DD optionally followed by time portion.
 * Accepts: 2026-01-15, 2026-01-15T10:30:00, 2026-01-15T10:30:00Z
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Extract date range params from URL search params.
 * Accepts both `date_from`/`date_to` and `dateFrom`/`dateTo` formats.
 * Invalid date formats are silently ignored (treated as absent).
 */
export function getDateRangeParams(url: URL): DateRangeParams {
  const rawFrom =
    url.searchParams.get('date_from') ??
    url.searchParams.get('dateFrom') ??
    undefined;
  const rawTo =
    url.searchParams.get('date_to') ??
    url.searchParams.get('dateTo') ??
    undefined;

  const dateFrom = rawFrom && ISO_DATE_RE.test(rawFrom) ? rawFrom : undefined;
  const dateTo = rawTo && ISO_DATE_RE.test(rawTo) ? rawTo : undefined;

  return { dateFrom, dateTo };
}

/**
 * Extract a single string param, returning undefined if not present.
 */
export function getStringParam(url: URL, key: string): string | undefined {
  return url.searchParams.get(key) ?? undefined;
}

/**
 * UUID format regex (v4-compatible, case-insensitive).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a string as a UUID. Useful for path params from [id] routes.
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Extract a UUID param with basic format validation.
 * Returns undefined if not present or invalid.
 */
export function getUuidParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  if (!value) return undefined;
  if (UUID_REGEX.test(value)) {
    return value;
  }
  return undefined;
}

/**
 * Strip protected fields from a request body before INSERT.
 * Prevents mass assignment of server-controlled columns.
 */
const PROTECTED_INSERT_FIELDS = ['id', 'institution_id', 'created_at', 'updated_at', 'created_by'];

export function sanitizeBody(body: Record<string, any>): Record<string, any> {
  const clean = { ...body };
  for (const field of PROTECTED_INSERT_FIELDS) {
    delete clean[field];
  }
  return clean;
}
