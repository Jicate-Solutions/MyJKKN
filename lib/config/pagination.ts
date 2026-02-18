// lib/config/pagination.ts
// Global pagination configuration and validation utilities

/**
 * Global pagination limits to prevent unbounded queries
 * These limits are enforced across all services to prevent DoS via large result sets
 */
export const PAGINATION_LIMITS = {
  /** Default page size if not specified */
  DEFAULT_PAGE_SIZE: 10,
  /** Maximum allowed page size (hard limit) */
  MAX_PAGE_SIZE: 100,
  /** Minimum allowed page size */
  MIN_PAGE_SIZE: 1,
  /** Maximum allowed page number (prevents excessive offset attacks) */
  MAX_PAGE_NUMBER: 10000,
} as const;

/**
 * Query timeout configuration (milliseconds)
 */
export const QUERY_TIMEOUTS = {
  /** Default timeout for most queries */
  DEFAULT: 30000, // 30 seconds
  /** Timeout for list/search queries */
  LIST: 10000, // 10 seconds
  /** Timeout for dashboard/analytics queries */
  DASHBOARD: 15000, // 15 seconds
  /** Timeout for single record fetch */
  SINGLE: 5000, // 5 seconds
} as const;

/**
 * Cache configuration for React Query (seconds)
 */
export const CACHE_CONFIG = {
  /** Dashboard data cache time */
  DASHBOARD: 60 * 5, // 5 minutes
  /** Statistics cache time */
  STATS: 60 * 2, // 2 minutes
  /** Dropdown options cache time */
  OPTIONS: 60 * 10, // 10 minutes
  /** List data cache time */
  LIST: 60 * 1, // 1 minute
  /** Single record cache time */
  SINGLE: 60 * 5, // 5 minutes
} as const;

/**
 * Validated pagination parameters
 */
export interface ValidatedPagination {
  page: number;
  limit: number;
}

/**
 * Pagination metadata in response
 */
export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Validate and sanitize pagination parameters
 * Ensures page and limit are within safe bounds to prevent resource exhaustion
 *
 * @param page - Requested page number (1-indexed)
 * @param limit - Requested items per page
 * @returns Validated and bounded pagination parameters
 *
 * @example
 * ```ts
 * const { page, limit } = validatePagination(req.page, req.limit);
 * // Always safe to use in queries
 * query.range((page - 1) * limit, page * limit - 1);
 * ```
 */
export function validatePagination(
  page?: number | null,
  limit?: number | null
): ValidatedPagination {
  // Validate and bound page number
  const validatedPage = Math.max(
    1, // Minimum page is 1
    Math.min(
      page && Number.isFinite(page) ? Math.floor(page) : 1,
      PAGINATION_LIMITS.MAX_PAGE_NUMBER
    )
  );

  // Validate and bound limit
  const validatedLimit = Math.max(
    PAGINATION_LIMITS.MIN_PAGE_SIZE,
    Math.min(
      limit && Number.isFinite(limit)
        ? Math.floor(limit)
        : PAGINATION_LIMITS.DEFAULT_PAGE_SIZE,
      PAGINATION_LIMITS.MAX_PAGE_SIZE
    )
  );

  return {
    page: validatedPage,
    limit: validatedLimit,
  };
}

/**
 * Calculate pagination metadata from total count
 *
 * @param total - Total number of records
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Complete pagination metadata
 */
export function calculatePaginationMetadata(
  total: number,
  page: number,
  limit: number
): PaginationMetadata {
  return {
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

/**
 * Sanitize search string to prevent SQL injection in ILIKE queries
 * Escapes special characters that have meaning in SQL LIKE patterns
 *
 * @param search - User input search string
 * @returns Sanitized search string safe for use in SQL ILIKE
 *
 * @example
 * ```ts
 * const search = sanitizeSearch(userInput);
 * query.ilike('name', `%${search}%`); // Safe from SQL injection
 * ```
 */
export function sanitizeSearch(search?: string | null): string {
  if (!search) return '';
  // Escape % and _ which are wildcards in SQL LIKE
  // Use backslash as escape character
  return search.replace(/[%_\\,()']/g, '\\$&').trim();
}

/**
 * Wrap a promise with a timeout to prevent hanging queries
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutMessage - Custom error message for timeout
 * @returns Promise that rejects if timeout is reached
 *
 * @example
 * ```ts
 * const data = await withTimeout(
 *   supabase.from('table').select(),
 *   QUERY_TIMEOUTS.LIST,
 *   'Query took too long'
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = QUERY_TIMEOUTS.DEFAULT,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Performance benchmark thresholds (milliseconds)
 * Used for monitoring and alerting on slow queries
 */
export const PERFORMANCE_THRESHOLDS = {
  /** Search/filter queries should complete under this */
  SEARCH: 200,
  /** Dashboard loads should complete under this */
  DASHBOARD: 1000,
  /** List queries should complete under this */
  LIST: 500,
  /** Single record fetch should complete under this */
  SINGLE: 100,
} as const;

/**
 * Log slow query warning if execution time exceeds threshold
 *
 * @param operation - Name of the operation for logging
 * @param startTime - Start time from performance.now()
 * @param threshold - Threshold in milliseconds
 */
export function logSlowQuery(
  operation: string,
  startTime: number,
  threshold: number
): void {
  const duration = performance.now() - startTime;
  if (duration > threshold) {
    console.warn(
      `[Performance] Slow query detected: ${operation} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
    );
  }
}
