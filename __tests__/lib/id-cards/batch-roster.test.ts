// __tests__/lib/id-cards/batch-roster.test.ts
// 2026-09-26 — the batch-print page shows the cohort as a tickable roster
// (photo, roll number, name). Everyone is ticked by default; the in-charge
// unticks. These are the pure helpers behind that list.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}) as never
}));

import {
  filterRoster,
  pluralNoun,
  rosterInitials,
  selectedRoster,
  type RosterLearner
} from '@/components/admin/id-cards/id-card-batch-print';

const roster: RosterLearner[] = [
  { id: 'a', name: 'Nakul A S', rollNumber: '8311', photoUrl: 'https://x/a.jpg', programId: 'p4', sectionName: 'B' },
  { id: 'b', name: 'Poorna Shri J', rollNumber: '4784', photoUrl: null, programId: 'p4', sectionName: 'A' },
  { id: 'c', name: 'Moulika Shri V.S', rollNumber: '4795', photoUrl: 'https://x/c.jpg', programId: 'p5', sectionName: 'A' }
];

describe('selectedRoster — everyone in until unticked', () => {
  it('returns the whole roster when nobody is excluded', () => {
    expect(selectedRoster(roster, new Set()).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
  it('drops exactly the excluded ids and keeps roster order', () => {
    expect(selectedRoster(roster, new Set(['b'])).map((l) => l.id)).toEqual(['a', 'c']);
  });
  it('ignores excluded ids that are not in the roster (stale cohort)', () => {
    expect(selectedRoster(roster, new Set(['zzz'])).length).toBe(3);
  });
});

describe('filterRoster — search by name or roll number', () => {
  it('blank search shows everyone', () => {
    expect(filterRoster(roster, '   ').length).toBe(3);
  });
  it('matches part of a name, case-insensitively', () => {
    expect(filterRoster(roster, 'shri').map((l) => l.id)).toEqual(['b', 'c']);
  });
  it('matches a roll number', () => {
    expect(filterRoster(roster, '831').map((l) => l.id)).toEqual(['a']);
  });
});

describe('rosterInitials', () => {
  it('first + last initial for a multi-word name', () => {
    expect(rosterInitials('Nakul A S')).toBe('NS');
  });
  it('two letters of a single word', () => {
    expect(rosterInitials('Anitha')).toBe('AN');
  });
  it('never blank', () => {
    expect(rosterInitials('   ')).toBe('?');
  });
});

describe('pluralNoun — picker summary copy', () => {
  it('school: "1 class", "2 classes"', () => {
    expect(pluralNoun('class', 1)).toBe('class');
    expect(pluralNoun('class', 2)).toBe('classes');
  });
  it('college: both halves pluralise', () => {
    expect(pluralNoun('class / programme', 3)).toBe('classes / programmes');
  });
});

describe('groupRosterByClass — sticky class headers when several classes are chosen', () => {
  it('keeps roster order and groups consecutive learners by programme', async () => {
    const { groupRosterByClass } = await import('@/components/admin/id-cards/id-card-batch-print');
    const groups = groupRosterByClass(roster);
    expect(groups.map((g) => g.key)).toEqual(['p4', 'p5']);
    expect(groups[0].learners.map((l) => l.id)).toEqual(['a', 'b']);
  });
  it('parks learners without a programme under one "__none__" group', async () => {
    const { groupRosterByClass } = await import('@/components/admin/id-cards/id-card-batch-print');
    const groups = groupRosterByClass([{ ...roster[0], programId: null }]);
    expect(groups[0].key).toBe('__none__');
  });
});

describe('estimatePrintTime — 15 s per card', () => {
  it('reads as seconds under 90 s, minutes after, hours past 60 min', async () => {
    const { estimatePrintTime } = await import('@/components/admin/id-cards/id-card-batch-print');
    expect(estimatePrintTime(0)).toBe('—');
    expect(estimatePrintTime(4)).toBe('≈ 60 s');
    expect(estimatePrintTime(19)).toBe('≈ 5 min');
    expect(estimatePrintTime(552)).toBe('≈ 2 h 18 min');
  });
});
