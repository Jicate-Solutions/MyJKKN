import { describe, it, expect } from 'vitest';
import {
  tallyMetricCountsPaged,
  PAGE_SIZE,
} from '@/hooks/accreditation/use-nirf-dashboard';

// ---------------------------------------------------------------------------
// The bug these tests encode, measured on production 2026-08-02:
//
//   PostgREST enforces `max-rows` (10,000 here) and reports the real total ONLY
//   in the `content-range` header, which the JS client does not surface. An
//   unpaged `.select()` over 11,396 NIRF rows returned 10,000 with
//   `error === null` — a successful-looking read and a wrong number.
//
// So the fake server below ENFORCES A CAP. That is the whole point: a fixture
// array counted in memory would pass against the broken code too, and prove
// nothing. Every test here fails if pagination is removed.
// ---------------------------------------------------------------------------

const SERVER_MAX_ROWS = 10_000;

/**
 * Stands in for PostgREST: honours `[from, to]`, but never returns more than
 * SERVER_MAX_ROWS in one response, and never errors when it truncates.
 */
function fakeServer(rows: { metric_code: string }[]) {
  let calls = 0;
  const fetchPage = async (from: number, to: number) => {
    calls += 1;
    const requested = to - from + 1;
    const capped = Math.min(requested, SERVER_MAX_ROWS);
    return rows.slice(from, from + capped);
  };
  return { fetchPage, callCount: () => calls };
}

const build = (spec: Record<string, number>) =>
  Object.entries(spec).flatMap(([metric_code, n]) =>
    Array.from({ length: n }, () => ({ metric_code })),
  );

describe('tallyMetricCountsPaged', () => {
  it('counts every row past the 10,000 server cap', async () => {
    // The exact production shape on the day NIRF was seeded.
    const rows = build({ TLR_SS: 3559, OI_GD: 3559, OI_RD: 3547, OI_ESCS: 731 });
    expect(rows).toHaveLength(11_396);

    const { fetchPage } = fakeServer(rows);
    const counts = await tallyMetricCountsPaged(fetchPage);

    expect(counts.TLR_SS).toBe(3559);
    expect(counts.OI_GD).toBe(3559);
    expect(counts.OI_RD).toBe(3547);
    expect(counts.OI_ESCS).toBe(731);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(11_396);
    // The pre-fix behaviour. If this ever equals 10,000 again the cap is back.
    expect(total).not.toBe(SERVER_MAX_ROWS);
  });

  it('does not drop the final partial page', async () => {
    // 2001 rows = two full pages plus one straggler — the row a `< PAGE_SIZE`
    // check placed BEFORE the tally would silently discard.
    const { fetchPage } = fakeServer(build({ TLR_SS: 2001 }));
    const counts = await tallyMetricCountsPaged(fetchPage);
    expect(counts.TLR_SS).toBe(2001);
  });

  it('stops as soon as a short page arrives, without a wasted request', async () => {
    const server = fakeServer(build({ TLR_SS: 1500 }));
    await tallyMetricCountsPaged(server.fetchPage);
    // Page 0 full (1000), page 1 short (500) → done. A third call would mean
    // the loop cannot recognise exhaustion.
    expect(server.callCount()).toBe(2);
  });

  it('makes exactly one request when the set fits in a page', async () => {
    // The per-institution path: largest is ASSF at 2,503, but a small college
    // must not pay for a second round trip.
    const server = fakeServer(build({ OI_RD: 760 }));
    const counts = await tallyMetricCountsPaged(server.fetchPage);
    expect(counts.OI_RD).toBe(760);
    expect(server.callCount()).toBe(1);
  });

  it('returns an empty tally rather than throwing when nothing is held', async () => {
    // PR_PEER and the other 12 unmapped metrics. Absent from the tally is what
    // lets the page say "not captured yet" instead of a measured zero.
    const server = fakeServer([]);
    const counts = await tallyMetricCountsPaged(server.fetchPage);
    expect(counts).toEqual({});
    expect(counts.PR_PEER).toBeUndefined();
    expect(server.callCount()).toBe(1);
  });

  it('ignores rows with no metric_code instead of counting an undefined bucket', async () => {
    const rows = [
      { metric_code: 'TLR_SS' },
      { metric_code: '' } as { metric_code: string },
      { metric_code: 'TLR_SS' },
    ];
    const { fetchPage } = fakeServer(rows);
    const counts = await tallyMetricCountsPaged(fetchPage);
    expect(counts).toEqual({ TLR_SS: 2 });
  });

  it('is bounded — a server that ignores range cannot spin it forever', async () => {
    // Always returns a full page regardless of offset. Without MAX_PAGES this
    // never terminates.
    let calls = 0;
    const runaway = async () => {
      calls += 1;
      return Array.from({ length: PAGE_SIZE }, () => ({ metric_code: 'X' }));
    };
    const counts = await tallyMetricCountsPaged(runaway);
    expect(calls).toBe(100);
    expect(counts.X).toBe(100 * PAGE_SIZE);
  });
});
