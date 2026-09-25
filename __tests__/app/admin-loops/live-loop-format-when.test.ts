// ============================================================================
// LIVE LOOPS — timestamps are read in India time, not the server's
// ============================================================================
// The bug this pins: the page's Intl option bags said 'en-IN' but carried no
// timeZone, so they rendered in whatever zone the PROCESS sat in. Vercel runs
// in UTC, so a measurement taken at 01:00 IST on the 19th appeared as the 18th
// — the wrong DAY, under a label promising Indian formatting.
//
// WHY THIS FILE FORCES A ZONE FIRST: the Mac these tests are written on is
// already set to Asia/Kolkata, where a pinned formatter and an unpinned one
// agree exactly. A test written without this would have passed against the
// BROKEN code and proved nothing. Setting a non-Indian process zone makes the
// assertions fail unless the formatters pin Asia/Kolkata themselves.
// ============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatDay,
  formatWhen,
} from '@/app/(routes)/admin/loops/live/_lib/format-when';

/** Anywhere but India, and on the far side of the date line from it. */
const FOREIGN_ZONE = 'America/New_York';
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = FOREIGN_ZONE;
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('formatWhen — India time, whatever zone the server runs in', () => {
  // 19:30 UTC on the 18th is 01:00 on the 19th in Salem, and 15:30 on the
  // 18th in New York. Every assertion below is about which of those it picks.
  const LATE_NIGHT_RUN = '2026-09-18T19:30:00.000Z';

  it('renders a 01:00 IST instant on the 19th, not the 18th', () => {
    const out = formatWhen(LATE_NIGHT_RUN);

    expect(out).toContain('19');
    expect(out).toContain('Sept');
    expect(out).toContain('01:00');
  });

  it('does not render the previous evening in the process zone', () => {
    const out = formatWhen(LATE_NIGHT_RUN);

    // The New York reading of the same instant, which the unpinned bag gave.
    expect(out).not.toContain('18 Sept');
    expect(out).not.toContain('03:30');
  });

  it('proves the zone is pinned, not inherited from the process', () => {
    // The control: the SAME instant read the way the broken code read it.
    // If these two ever agree, the process zone has drifted to IST and the
    // test above is no longer proving anything.
    const unpinned = new Date(LATE_NIGHT_RUN).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    expect(unpinned).toContain('18 Sept');
    expect(formatWhen(LATE_NIGHT_RUN)).not.toBe(unpinned);
  });

  it('says "—" for a missing or unreadable timestamp rather than a fake date', () => {
    expect(formatWhen(null)).toBe('—');
    expect(formatWhen('not a date')).toBe('—');
  });
});

describe('formatDay — the bar-set date, same rule', () => {
  it('rolls a late-evening UTC instant forward to the Indian day', () => {
    const out = formatDay('2026-09-18T19:30:00.000Z');

    expect(out).toContain('19');
    expect(out).toContain('Sept');
    expect(out).not.toContain('18 Sept');
  });

  it('keeps a mid-day instant on its own Indian day', () => {
    expect(formatDay('2026-09-18T06:00:00.000Z')).toContain('18');
  });

  it('says "—" for a missing or unreadable date', () => {
    expect(formatDay(null)).toBe('—');
    expect(formatDay('')).toBe('—');
  });
});
