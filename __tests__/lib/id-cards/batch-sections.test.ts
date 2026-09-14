// __tests__/lib/id-cards/batch-sections.test.ts
// 2026-09-07 — the batch-print Section picker must show each section ONCE.
//
// sections rows are stored per semester (sections.semester_id), so a B.E.
// programme with eight semesters carries eight "A" rows. The picker used to
// list the raw rows and showed "Section A" eight times (screenshot
// 2026-09-07). groupSectionsByName collapses them to one choice per name and
// keeps every id behind it, so the learner filter still matches all of them.

import { describe, it, expect, vi } from 'vitest';

// The component's import chain reaches createClientSupabaseClient at module
// init, which throws without Supabase env vars. Only the pure helper is under
// test — stub the client.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}) as never
}));

import { groupSectionsByName } from '@/components/admin/id-cards/id-card-batch-print';

const row = (id: string, section_name: string, semester_id: string | null) => ({
  id,
  section_name,
  semester_id
});

describe('groupSectionsByName', () => {
  it('collapses one "A" per semester into a single choice carrying every id', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`a${i + 1}`, 'A', `sem${i + 1}`));
    const choices = groupSectionsByName(rows);
    expect(choices).toHaveLength(1);
    expect(choices[0].name).toBe('A');
    expect(choices[0].ids).toEqual(rows.map((r) => r.id));
  });

  it('keeps distinct names apart and sorts them naturally', () => {
    const choices = groupSectionsByName([
      row('1', 'B', 's1'),
      row('2', '10', 's1'),
      row('3', 'A', 's1'),
      row('4', '2', 's1'),
      row('5', 'A', 's2')
    ]);
    expect(choices.map((c) => c.name)).toEqual(['2', '10', 'A', 'B']);
    expect(choices.find((c) => c.name === 'A')?.ids).toEqual(['3', '5']);
  });

  it('trims names and drops blank ones; a section with no semester still counts', () => {
    const choices = groupSectionsByName([row('1', ' A ', null), row('2', '', 's1'), row('3', 'A', 's1')]);
    expect(choices).toEqual([{ name: 'A', ids: ['1', '3'] }]);
  });

  it('returns an empty list for no rows', () => {
    expect(groupSectionsByName([])).toEqual([]);
  });
});
