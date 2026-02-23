// lib/utils/toast-error.ts
// Sanitize error messages for user-facing toast notifications.
// Raw Supabase / PostgreSQL errors often contain SQL details, policy names,
// or column references that are meaningless (or confusing) to end users.

/**
 * Given a raw Error (often from Supabase), return a short,
 * user-friendly string suitable for a toast notification.
 *
 * @param error   The caught Error object
 * @param fallback  A fallback message if sanitization can't extract anything useful
 */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback

  const msg =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error)

  if (!msg || msg === '[object Object]') return fallback

  // ---- Supabase / PostgreSQL patterns that should NOT reach the user ----

  // RLS policy violation
  if (msg.includes('row-level security') || msg.includes('policy')) {
    return 'You do not have permission to perform this action'
  }

  // Foreign key violation
  if (msg.includes('violates foreign key constraint')) {
    return 'This record is referenced by other data and cannot be modified'
  }

  // Unique constraint violation
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return 'A record with the same data already exists'
  }

  // Not-null constraint
  if (msg.includes('not-null constraint') || msg.includes('null value in column')) {
    return 'A required field is missing. Please fill in all required fields.'
  }

  // Column does not exist (schema mismatch)
  if (msg.includes('column') && msg.includes('does not exist')) {
    return fallback
  }

  // Relation / table does not exist
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return fallback
  }

  // Network / timeout
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
    return 'Network error. Please check your connection and try again.'
  }

  // JWT / auth expired
  if (msg.includes('JWT') || msg.includes('token') || msg.includes('not authenticated')) {
    return 'Your session has expired. Please log in again.'
  }

  // If the message is reasonably short and doesn't look like SQL, let it through
  if (msg.length <= 120 && !msg.includes('SELECT') && !msg.includes('INSERT') && !msg.includes('UPDATE')) {
    return msg
  }

  // Fallback for anything else
  return fallback
}
