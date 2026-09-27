/**
 * BUG-006210 (2026-09-25): /campus-living/attendance/absentees crashed with
 * "Cannot read properties of undefined (reading 'variant')" — the page read a
 * `status` field raw hostel_attendance rows do not have. buildAbsenteeRows turns
 * the raw rows into what the page shows.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { buildAbsenteeRows, tierFor } from '@/lib/campus-living/absentee-rows';

const rec = (learner_id: string, date: string, evening_status = 'absent', name = learner_id) => ({
  learner_id, date, evening_status: evening_status as never,
  learner: { id: learner_id, full_name: name, email: `${learner_id}@t` },
  block: { id: 'b', name: 'Block A', code: 'A' },
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
    expect(rows[0].block).toBe('Block A');
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
});
