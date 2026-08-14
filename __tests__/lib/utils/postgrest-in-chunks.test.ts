import { describe, it, expect } from 'vitest';
import {
  POSTGREST_IN_CHUNK_SIZE,
  chunkIdsForIn,
  selectInChunks,
} from '@/lib/utils/postgrest-in-chunks';

// ---------------------------------------------------------------------------
// PostgREST puts .in() values in the query string, so an unchunked id list
// makes the request URL too long and the read fails outright (HTTP 400 from
// the gateway). Callers written as `(result as any).data || []` turn that
// failure into an EMPTY lookup, so every row silently renders its fallback
// label instead of the real record. A 5-id test cannot see any of this, which
// is why the scale cases below use the real production id count.
//
// Measured on production 2026-08-11 against /rest/v1/courses:
//   640 uuids → 25,064 URL chars → HTTP 200
//   680 uuids → 26,624 URL chars → HTTP 400
//   750 uuids → 29,354 URL chars → HTTP 400  ← the all-institutions estate
// ---------------------------------------------------------------------------

/** Chars a uuid contributes to an `id=in.(…)` clause, including its separator. */
const CHARS_PER_ID = 37;
/** Request-line size that returned HTTP 400 on production. */
const GATEWAY_REJECTS_AT_CHARS = 26_624;

const uuidLike = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('chunkIdsForIn', () => {
  it('returns no chunks for an empty list', () => {
    expect(chunkIdsForIn([])).toEqual([]);
  });

  it('keeps a short list in a single chunk', () => {
    expect(chunkIdsForIn(['a', 'b', 'c'], 100)).toEqual([['a', 'b', 'c']]);
  });

  it('splits on the boundary and keeps the short trailing chunk', () => {
    const chunks = chunkIdsForIn(['a', 'b', 'c', 'd', 'e'], 2);
    expect(chunks).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('preserves order and drops nothing', () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuidLike(i));
    expect(chunkIdsForIn(ids, 100).flat()).toEqual(ids);
  });

  it('rejects a nonsensical chunk size instead of looping forever', () => {
    expect(() => chunkIdsForIn(['a'], 0)).toThrow(/size must be >= 1/);
  });
});

describe('selectInChunks at production scale', () => {
  // The exact distinct course-id count the all-institutions Pending Attendance
  // view resolves on production. Spread the "interesting" ids across every
  // chunk boundary, including the last short one, so dropping any chunk
  // changes the answer.
  const IDS = Array.from({ length: 750 }, (_, i) => uuidLike(i));

  it('never lets a single request exceed the size the gateway rejects', () => {
    for (const chunk of chunkIdsForIn(IDS, POSTGREST_IN_CHUNK_SIZE)) {
      expect(chunk.length * CHARS_PER_ID).toBeLessThan(GATEWAY_REJECTS_AT_CHARS);
    }
  });

  it('resolves all 750 ids without dropping one', async () => {
    const seen: string[][] = [];
    const rows = await selectInChunks(IDS, async (chunk) => {
      seen.push(chunk);
      return { data: chunk.map((id) => ({ id })), error: null };
    });

    expect(rows).toHaveLength(750);
    expect(rows.map((r) => r.id)).toEqual(IDS);
    // 750 ids at 100 per request.
    expect(seen).toHaveLength(8);
    expect(seen.at(-1)).toHaveLength(50);
  });

  it('builds a complete lookup map — the ids at every chunk edge resolve', async () => {
    const rows = await selectInChunks(IDS, async (chunk) => ({
      data: chunk.map((id) => ({ id, course_name: `Course ${id.slice(-3)}` })),
      error: null,
    }));

    const lookup = rows.reduce<Record<string, { course_name: string }>>((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});

    // First, both sides of each boundary, and the final id.
    for (const index of [0, 99, 100, 199, 200, 699, 700, 749]) {
      expect(lookup[IDS[index]]?.course_name).toBeDefined();
    }
  });

  it('skips the round trip entirely when there are no ids', async () => {
    let called = 0;
    const rows = await selectInChunks([], async (chunk) => {
      called += 1;
      return { data: chunk.map((id) => ({ id })), error: null };
    });

    expect(rows).toEqual([]);
    expect(called).toBe(0);
  });

  it('throws on a failed chunk rather than returning a half-built lookup', async () => {
    await expect(
      selectInChunks(IDS, async (chunk) =>
        chunk.includes(IDS[300])
          ? { data: null, error: new Error('Bad Request') }
          : { data: chunk.map((id) => ({ id })), error: null }
      )
    ).rejects.toThrow('Bad Request');
  });
});
