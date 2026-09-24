/**
 * readRecentReadings — the scale shown above the bar box on a bar card.
 *
 * Reviewer B, round 2 on #3883: one global ordered query with a shared
 * `limit(keys × 4)` let a daily loop (40 rows) take every slot while a weekly
 * loop (10 rows) got none, and the card then said "no readings recorded yet"
 * about a loop that had run ten times. The read is per loop now; this file
 * pins that a slow loop still shows its values next to a busy one.
 */
import { describe, it, expect, vi } from 'vitest';
import { readRecentReadings } from '@/lib/services/loops/loop-recent-readings';

type Admin = Parameters<typeof readRecentReadings>[0];

/** A stand-in service-role client whose loop_measurements rows are keyed per loop. */
function makeAdmin(rowsByKey: Record<string, { value: number | string | null }[]>, opts: { error?: string } = {}) {
  const calls: { key: string; limit: number }[] = [];
  const from = vi.fn(() => {
    let key = '';
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'loop_key') key = val;
        return chain;
      },
      order: () => chain,
      limit: async (n: number) => {
        calls.push({ key, limit: n });
        if (opts.error) return { data: null, error: { message: opts.error } };
        return { data: (rowsByKey[key] ?? []).slice(0, n), error: null };
      },
    };
    return chain;
  });
  return { admin: { from } as unknown as Admin, calls };
}

describe('readRecentReadings', () => {
  it('a weekly loop keeps its readings next to a daily loop (no shared budget)', async () => {
    const daily = Array.from({ length: 40 }, (_, i) => ({ value: 100 - i }));
    const weekly = Array.from({ length: 10 }, (_, i) => ({ value: 7 - i }));
    const { admin, calls } = makeAdmin({ 'daily-loop': daily, 'weekly-loop': weekly });

    const out = await readRecentReadings(admin, ['daily-loop', 'weekly-loop']);

    expect(out.get('daily-loop')).toEqual([100, 99, 98, 97]);
    expect(out.get('weekly-loop')).toEqual([7, 6, 5, 4]);
    // one read per loop, each with its own window
    expect(calls).toEqual([
      { key: 'daily-loop', limit: 4 },
      { key: 'weekly-loop', limit: 4 },
    ]);
  });

  it('a loop with no rows maps to an empty list, not to another loop\'s numbers', async () => {
    const { admin } = makeAdmin({ busy: [{ value: 1 }, { value: 2 }] });
    const out = await readRecentReadings(admin, ['busy', 'quiet']);
    expect(out.get('busy')).toEqual([1, 2]);
    expect(out.get('quiet')).toEqual([]);
  });

  it('numeric strings become numbers, NULL values stay null', async () => {
    const { admin } = makeAdmin({ k: [{ value: '42.5' }, { value: null }, { value: 'abc' }] });
    const out = await readRecentReadings(admin, ['k']);
    expect(out.get('k')).toEqual([42.5, null, null]);
  });

  it('pre-migration (table missing) yields empty lists for every loop, never throws', async () => {
    const { admin } = makeAdmin({}, { error: 'relation "public.loop_measurements" does not exist' });
    const out = await readRecentReadings(admin, ['a', 'b']);
    expect(out.get('a')).toEqual([]);
    expect(out.get('b')).toEqual([]);
  });

  it('no keys → no reads', async () => {
    const { admin, calls } = makeAdmin({});
    const out = await readRecentReadings(admin, []);
    expect(out.size).toBe(0);
    expect(calls).toEqual([]);
  });
});
