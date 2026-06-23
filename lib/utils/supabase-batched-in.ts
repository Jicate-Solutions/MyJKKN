/**
 * Run a PostgREST `.in(col, values)` filter safely for large value lists.
 *
 * WHY THIS EXISTS (real production incident, staff/check-missing-profiles):
 * Supabase serializes `.in('email', [...])` into the GET query string. With
 * ~800+ values the URL grows past ~31 KB and the Supabase/Kong gateway rejects
 * it with a bare HTTP 400 — surfaced by supabase-js as `{ message: 'Bad Request' }`
 * (no PostgREST `code`/`details`). The failure is fast, not a timeout, and is
 * easy to misread as a query problem. Empirically a 100-value batch is safe.
 *
 * This helper splits the values into chunks, runs the caller-built query per
 * chunk, and concatenates the rows. The first error short-circuits and is
 * returned in the same `{ data, error }` shape the call sites already destructure.
 *
 * @param values   The full list of filter values (e.g. emails, user ids).
 * @param runChunk Builds + awaits the query for one chunk. Apply `.in(col, chunk)`
 *                 plus any other filters (`.eq(...)`, `.select(...)`) inside.
 * @param batchSize Max values per request (default 100 — well under the URL limit).
 */
export async function selectInBatches<T>(
  values: string[],
  runChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  batchSize = 100
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  for (let i = 0; i < values.length; i += batchSize) {
    const chunk = values.slice(i, i + batchSize);
    const { data, error } = await runChunk(chunk);
    if (error) {
      return { data: rows, error };
    }
    if (data) {
      rows.push(...data);
    }
  }
  return { data: rows, error: null };
}
