// ============================================
// POSTGREST .in() CHUNKING
// ============================================
// Created: 2026-08-11
// Purpose: Run an `.in()` lookup as a series of bounded requests so the
//          generated URL can never overflow the API gateway's request-line
//          limit.
//
// WHY THIS EXISTS
// PostgREST encodes `.in()` values into the query string, so the request URL
// grows linearly with the id count. Past the gateway's limit the request is
// rejected outright — and because a rejected read returns `{ data: null }`,
// any caller written as `const rows = (result as any).data || []` silently
// degrades to an EMPTY lookup table rather than failing loudly. Every row then
// renders whatever fallback string the caller supplies ("Unknown Course",
// "Unknown Staff", …) even though the underlying records exist and are
// readable.
//
// MEASURED ON PRODUCTION (2026-08-11, project kvizhngldtiuufknvehv, GET
// /rest/v1/courses?id=in.(…)&select=id,course_name,course_code):
//   640 uuids → 25,064 URL chars → HTTP 200 (640 rows)
//   680 uuids → 26,624 URL chars → HTTP 400 Bad Request
//   750 uuids → 29,354 URL chars → HTTP 400 Bad Request
// The cliff sits near 26 KB of request line. 100 uuids ≈ 3.7 KB, which keeps a
// wide margin under it and matches the chunk size already used by
// lib/services/id-cards/print-jobs-client.ts.
// ============================================

/**
 * Ids per request. Chosen so a chunk's URL stays far below the ~26 KB gateway
 * limit measured above: 100 uuids ≈ 3.7 KB.
 */
export const POSTGREST_IN_CHUNK_SIZE = 100;

/**
 * Split `ids` into consecutive chunks of at most `size`, preserving order.
 * Returns `[]` for an empty input so callers can skip the round trip entirely.
 */
export function chunkIdsForIn<T>(
  ids: readonly T[],
  size: number = POSTGREST_IN_CHUNK_SIZE
): T[][] {
  if (size < 1) {
    throw new Error(`chunkIdsForIn: size must be >= 1, received ${size}`);
  }

  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size) as T[]);
  }
  return chunks;
}

/** Shape of a PostgREST/supabase-js response, narrowed to what we consume. */
interface ChunkResponse<Row> {
  data: Row[] | null;
  error: unknown;
}

/**
 * Run `fetchChunk` once per bounded chunk of `ids` and concatenate the rows.
 *
 * Errors are THROWN rather than swallowed — a lookup that half-succeeded would
 * produce a partially-populated map, which is the silent-failure mode this
 * helper exists to prevent (engineering rule #27). Callers that already wrap
 * their work in try/catch keep their existing error path.
 *
 * @example
 *   const courses = await selectInChunks(courseIds, (chunk) =>
 *     supabase.from('courses').select('id, course_name').in('id', chunk)
 *   );
 */
export async function selectInChunks<Row>(
  ids: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<ChunkResponse<Row>>,
  size: number = POSTGREST_IN_CHUNK_SIZE
): Promise<Row[]> {
  if (ids.length === 0) return [];

  const rows: Row[] = [];
  for (const chunk of chunkIdsForIn(ids, size)) {
    const { data, error } = await fetchChunk(chunk);
    if (error) throw error;
    if (data) rows.push(...data);
  }
  return rows;
}
