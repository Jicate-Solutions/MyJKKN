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

/**
 * Pagination metadata returned with list queries
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Validate and normalize pagination parameters
 */
export function validatePagination(page?: number, limit?: number): { page: number; limit: number; offset: number } {
  const validPage = Math.max(1, Math.floor(Number(page) || 1));
  const validLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
  return { page: validPage, limit: validLimit, offset: (validPage - 1) * validLimit };
}

/**
 * Calculate pagination metadata from total count
 */
export function calculatePaginationMetadata(total: number, page: number, limit: number): PaginationMetadata {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Query timeout constants (milliseconds)
 */
export const QUERY_TIMEOUTS = {
  fast: 5000,
  normal: 15000,
  slow: 30000,
  report: 60000,
  // Referenced by BaseService.execute{Create,Update,Delete,List,Single,Dashboard}
  // (DEFAULT covers create/update/delete). These keys went missing in a refactor —
  // without them the timeout is `undefined`, which setTimeout coerces to ~0ms and
  // aborts the query on the next tick (broke the analytics dashboard, and silently
  // broke executeListQuery/Single/Create/Update/Delete for their callers).
  DEFAULT: 15000,
  LIST: 15000,
  SINGLE: 8000,
  DASHBOARD: 30000,
} as const;

/**
 * Performance thresholds for slow query logging
 */
export const PERFORMANCE_THRESHOLDS = {
  warn: 1000,  // Log warning above 1s (generic default)
  error: 5000, // Log error above 5s
  // Per-query-kind warn thresholds used by BaseService.execute* helpers. Dashboards
  // legitimately take longer (multi-section aggregates + cold-start round-trips), so
  // the 1s default produces false "SLOW QUERY" noise — give them headroom.
  LIST: 1500,
  SINGLE: 800,
  DASHBOARD: 3000,
} as const;

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Query timeout after ${ms}ms${label ? `: ${label}` : ''}`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Log slow queries for monitoring
 */
export function logSlowQuery(
  label: string,
  durationMs: number,
  warnThreshold: number = PERFORMANCE_THRESHOLDS.warn
): void {
  if (durationMs > PERFORMANCE_THRESHOLDS.error) {
    console.error(`[SLOW QUERY] ${label}: ${durationMs}ms (threshold: ${PERFORMANCE_THRESHOLDS.error}ms)`);
  } else if (durationMs > warnThreshold) {
    console.warn(`[SLOW QUERY] ${label}: ${durationMs}ms (threshold: ${warnThreshold}ms)`);
  }
}
