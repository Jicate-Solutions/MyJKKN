/**
 * Turn anything thrown by a Supabase call into a message worth showing.
 *
 * postgrest-js only wraps failures in a real PostgrestError when .throwOnError()
 * is used; otherwise `error` is the raw parsed JSON body — a PLAIN OBJECT that is
 * not an instance of Error (see PostgrestBuilder: `error = JSON.parse(body)`).
 * Our services do `if (error) throw error`, so the very common UI idiom
 *
 *     catch (e) { toast.error(e instanceof Error ? e.message : 'Something failed') }
 *
 * takes the false branch for every database error and throws away the one piece
 * of information that would explain the failure. That is how an RLS refusal on
 * ims_suppliers reached a user as the unhelpful "Failed to add quotation".
 */

/** The shape postgrest returns on failure. */
interface PostgrestLike {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** `... for table "ims_suppliers"` -> `ims_suppliers` */
const tableFrom = (msg: string): string | null => msg.match(/table "([^"]+)"/)?.[1] ?? null;

/**
 * Best available message for `e`, falling back to `fallback` when there is
 * genuinely nothing to say.
 *
 * The two Postgres codes translated here are the ones this codebase's writes
 * actually produce; everything else passes the database's own wording through,
 * which is far more useful than a generic string even when it is terse.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'string' && e.trim()) return e;

  const raw = isRecord(e) ? (e as PostgrestLike) : null;
  const message = typeof raw?.message === 'string' ? raw.message.trim() : '';
  const code = typeof raw?.code === 'string' ? raw.code : '';

  // 42501 — row-level security refused the write. The Postgres wording ("new row
  // violates row-level security policy for table ...") reads as a system fault
  // rather than a permissions one, so say what it means.
  if (code === '42501') {
    const table = tableFrom(message);
    return table
      ? `You do not have access to these records for this institution (${table}).`
      : 'You do not have access to these records for this institution.';
  }

  // 23505 — unique violation. Nearly always "this already exists", e.g. a second
  // quotation from the same vendor on one RFQ.
  if (code === '23505') {
    const details = typeof raw?.details === 'string' ? raw.details.trim() : '';
    return details ? `This record already exists. ${details}` : 'This record already exists.';
  }

  if (message) return message;
  if (e instanceof Error && e.message.trim()) return e.message;
  return fallback;
}
