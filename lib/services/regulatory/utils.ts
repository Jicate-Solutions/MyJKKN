// ============================================================================
// Regulatory Service Utilities
// Shared validation and formatting functions used across all regulatory services
// ============================================================================

/**
 * Validate UUID format to prevent "invalid input syntax for type uuid" errors
 */
export function isValidUUID(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
    return false
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

/**
 * Validate ID and throw descriptive error if invalid
 */
export function validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
  if (!isValidUUID(id)) {
    const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`
    console.error(`[Regulatory] Invalid ${fieldName}: ${actualValue}`)
    throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`)
  }
}

/**
 * Sanitize a search term for safe use in PostgREST .or() filter strings.
 * Strips commas, parentheses, periods (PostgREST field separators),
 * backslashes, and percent signs (ilike wildcards from user input).
 */
export function sanitizeSearch(term: string): string {
  return term.replace(/[,().\\%]/g, ' ').trim()
}

/**
 * Format error for logging (handles Supabase PostgrestError which doesn't serialize properly)
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (e.message) return String(e.message)
    if (e.details) return String(e.details)
    if (e.hint) return String(e.hint)
    return JSON.stringify(error)
  }
  return String(error)
}
