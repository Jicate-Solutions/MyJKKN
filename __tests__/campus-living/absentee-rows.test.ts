/**
 * BUG-006210 (2026-09-25): /campus-living/attendance/absentees crashed with
 * "Cannot read properties of undefined (reading 'variant')" — the page read a
 * `status` field raw hostel_attendance rows do not have. buildAbsenteeRows turns
 * the raw rows into what the page shows.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { absenteeWindowStart, buildAbsenteeRows, fetchAllPages, localIsoDate, tierFor } from '@/lib/campus-living/absentee-rows';

const rec = (learner_id: string, date: string, evening_status = 'absent', name = learner_id, blockId = 'b') => ({
  learner_id, date, evening_status: evening_status as never, block_id: blockId,
  learner: { id: learner_id, full_name: name, email: `${learner_id}@t` },
  block: { id: blockId, name: `Block ${blockId.toUpperCase()}`, code: blockId.toUpperCase() },
});

describe('buildAbsenteeRows (BUG-006210)', () => {
  it('one row per resident absent on the latest marked day, with the run of days counted back', () => {
    const rows = buildAbsenteeRows([
      rec('ann', '2026-09-27'), rec('ann', '2026-09-26'), rec('ann', '2026-09-25'),
      rec('bob', '2026-09-27'), rec('bob', '2026-09-26'),
      rec('cy', '2026-09-27'),
      rec('dee', '2026-09-26'),                       // not absent on the latest day
      rec('eve', '2026-09-27'), rec('eve', '2026-09-25'), // a gap: run is 1
    ], '2026-09-23');
    expect(rows.map((r) => [r.learnerId, r.consecutiveDays, r.tier, r.absentSince])).toEqual([
      ['ann', 3, 'critical', '2026-09-25'],
      ['bob', 2, 'warning', '2026-09-26'],
      ['cy', 1, 'normal', '2026-09-27'],
      ['eve', 1, 'normal', '2026-09-27'],
    ]);
    expect(rows[0].block).toBe('Block B');
  });

  it('a run that reaches the start of the window is flagged as "at least"', () => {
    const rows = buildAbsenteeRows(
      ['2026-09-27', '2026-09-26', '2026-09-25', '2026-09-24', '2026-09-23'].map((d) => rec('ann', d)),
      '2026-09-23',
    );
    expect(rows[0]).toMatchObject({ consecutiveDays: 5, atLeast: true, tier: 'critical' });
  });

  it('ignores present / on-leave rows and rows with no learner, and never yields an unknown tier', () => {
    const rows = buildAbsenteeRows([
      rec('ann', '2026-09-27', 'present'), rec('bob', '2026-09-27', 'on_leave'),
      { ...rec('x', '2026-09-27'), learner_id: '' },
    ], '2026-09-23');
    expect(rows).toEqual([]);
    for (const n of [0, 1, 2, 3, 9]) expect(['critical', 'warning', 'normal']).toContain(tierFor(n));
  });

  it('the page builds its rows with buildAbsenteeRows and never indexes statusConfig by a raw record field', () => {
    const page = readFileSync(path.resolve(__dirname, '../../app/(routes)/campus-living/attendance/absentees/page.tsx'), 'utf8');
    expect(page).toContain('buildAbsenteeRows');
    expect(page).not.toMatch(/statusConfig\[student\.status\]/);
  });

  it('"today" is each block\'s own latest marked day: a block that marks late keeps its absentees', () => {
    const rows = buildAbsenteeRows([
      rec('ann', '2026-09-27', 'absent', 'ann', 'a'),
      rec('bob', '2026-09-26', 'absent', 'bob', 'b'), // block B has not marked 27 Sep yet
      rec('bob', '2026-09-25', 'absent', 'bob', 'b'),
    ], '2026-09-23');
    expect(rows.map((r) => [r.learnerId, r.consecutiveDays])).toEqual([['bob', 2], ['ann', 1]]);
  });

  it('a block that marked today with no absences does not show yesterday\'s absentees', () => {
    const rows = buildAbsenteeRows([
      rec('ann', '2026-09-27', 'absent', 'ann', 'a'),
      rec('cy', '2026-09-27', 'present', 'cy', 'c'),
      rec('dee', '2026-09-26', 'absent', 'dee', 'c'), // came back on the 27th
    ], '2026-09-23');
    expect(rows.map((r) => r.learnerId)).toEqual(['ann']);
  });
});

describe('absentee window dates (IST before 05:30)', () => {
  it('uses the local calendar day, not UTC: 00:30 IST on 28 Sep gives a 5-day window from 24 Sep', () => {
    // 2026-09-27T19:00Z is 00:30 on 28 Sep in IST; toISOString would say the 27th.
    const d = new Date(2026, 8, 28, 0, 30);
    expect(localIsoDate(d)).toBe('2026-09-28');
    expect(absenteeWindowStart(d)).toBe('2026-09-24');
  });
});

describe('fetchAllPages (rows past the 1000 cap are not dropped)', () => {
  const pager = (total: number, size = 1000) => (page: number) =>
    Promise.resolve({
      data: Array.from({ length: Math.max(0, Math.min(size, total - (page - 1) * size)) }, (_, i) => (page - 1) * size + i),
      count: total,
    });

  it('reads every page until the count is reached', async () => {
    const res = await fetchAllPages(pager(2350));
    expect(res.data).toHaveLength(2350);
    expect(res.truncated).toBe(false);
  });

  it('flags the list as truncated when the page cap is hit', async () => {
    const res = await fetchAllPages(pager(5000), 2);
    expect(res).toMatchObject({ count: 5000, truncated: true });
    expect(res.data).toHaveLength(2000);
  });

  it('stops on an empty page even if the count says more', async () => {
    const res = await fetchAllPages(() => Promise.resolve({ data: [] as number[], count: 10 }));
    expect(res.data).toHaveLength(0);
  });
});
