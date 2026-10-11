import { describe, it, expect } from 'vitest';
import { readCount } from '@/lib/bug-reports/read-count';

// ---------------------------------------------------------------------------
// This pins the exact bug that shipped twice in one afternoon, in two routes
// written hours apart, and survived every manual test.
//
// `Number(null)` and `Number('')` are both 0. An absent ?batch= / ?fixability=
// param is null, and fn_get_policy returns SQL NULL for a row that has not been
// seeded. So the obvious reader —
//     const n = Number(raw); if (Number.isFinite(n) && n >= 0) use(n)
// — reads "no value" as an explicit ZERO. Zero is MEANINGFUL for both knobs
// (it pauses the drip, it switches the group pass off), so the failure inverts
// silently: every manual run passed the value and worked, while the SCHEDULED
// run would have done nothing at all and raised nothing.
//
// The two cases that matter are therefore the first two. The rest stop someone
// "simplifying" this back into Number().
// ---------------------------------------------------------------------------

describe('readCount — absence must never read as zero', () => {
  it('returns null for an ABSENT value, not 0 (the scheduled-run bug)', () => {
    expect(readCount(null)).toBeNull();      // searchParams.get, unseeded policy row
    expect(readCount(undefined)).toBeNull();
    expect(readCount('')).toBeNull();        // ?batch= with nothing after it
    expect(readCount('   ')).toBeNull();
  });

  it('PRESERVES a real 0, because that is how these knobs are switched off', () => {
    expect(readCount(0)).toBe(0);
    expect(readCount('0')).toBe(0);
  });

  it('reads an ordinary count from either a number or a string', () => {
    expect(readCount(15)).toBe(15);
    expect(readCount('15')).toBe(15);
    expect(readCount(10)).toBe(10);
  });

  it('falls back on a MALFORMED policy value rather than landing on 0', () => {
    expect(readCount('abc')).toBeNull();
    expect(readCount(-1)).toBeNull();
    expect(readCount(Number.NaN)).toBeNull();
    expect(readCount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(readCount({})).toBeNull();
    expect(readCount([])).toBeNull();        // Number([]) is 0 — the same trap
    expect(readCount(['3'])).toBeNull();     // Number(['3']) is 3 — looks valid, isn't
  });

  it('treats a boolean as absence — Number(true) is 1 and would pass silently', () => {
    expect(readCount(true)).toBeNull();
    expect(readCount(false)).toBeNull();     // Number(false) is 0: the trap again
  });

  it('floors a fractional value instead of queueing a fraction of a report', () => {
    expect(readCount(7.9)).toBe(7);
    expect(readCount('7.9')).toBe(7);
  });

  it('composes with ?? so the caller supplies its own default', () => {
    const DEFAULT = 15;
    expect(readCount(null) ?? DEFAULT).toBe(15);  // unseeded → default
    expect(readCount(0) ?? DEFAULT).toBe(0);      // explicit pause → honoured
    expect(readCount(6) ?? DEFAULT).toBe(6);      // tuned row → honoured
  });
});
