import { describe, expect, it } from 'vitest';

import {
  computeLeadershipStats,
  type LeaderPerson,
  type OverviewRow,
  type PostEntry,
} from '@/lib/organizations/leadership-stats';

const person = (id: string, extra: Partial<LeaderPerson> = {}): LeaderPerson => ({
  user_id: id,
  full_name: id,
  email: null,
  ...extra,
});

const post = (code: string, holder: LeaderPerson | null = null): PostEntry => ({
  code,
  label: code,
  kind: code === 'headmaster' ? 'generic' : 'principal_role',
  is_builtin: code !== 'headmaster',
  holder,
});

const row = (id: string, posts: PostEntry[]): OverviewRow => ({
  institution_id: id,
  institution_name: id,
  posts,
});

describe('computeLeadershipStats', () => {
  it('counts coverage only against posts that apply to each institution', () => {
    const s = computeLeadershipStats([
      row('College', [post('principal', person('p1')), post('vice_principal', person('v1'))]),
      row('School', [post('principal', person('p2')), post('headmaster')]),
    ]);
    expect(s.totalPosts).toBe(4); // not 2 institutions x 3 distinct posts
    expect(s.filledPosts).toBe(3);
    expect(s.vacantPosts).toBe(1);
    expect(s.fullyStaffed).toBe(1);
    const hm = s.perPost.find((p) => p.code === 'headmaster');
    expect(hm).toMatchObject({ applicable: 1, filled: 0, pct: 0 });
    expect(s.perPost.find((p) => p.code === 'vice_principal')).toMatchObject({ applicable: 1, pct: 100 });
  });

  it('never treats an unrecorded basis as ex officio, and ignores non-basis posts', () => {
    const s = computeLeadershipStats([
      row('A', [post('principal', person('p1', { basis_code: null }))]),
      row('B', [post('principal', person('p2', { basis_code: 'personal', basis_passes_to_successor: false }))]),
      row('C', [
        post('principal', person('p3', { basis_code: 'ex_officio', basis_passes_to_successor: true })),
        post('headmaster', person('h1')),
      ]),
    ]);
    expect(s.basis).toEqual({ total: 3, personal: 1, successor: 1, notRecorded: 1 });
  });

  it('flags multi-college holders but not same-college double posts', () => {
    const s = computeLeadershipStats([
      row('A', [post('principal', person('x')), post('vice_principal', person('x'))]),
      row('B', [post('principal', person('x'))]),
      row('C', [post('principal', person('y')), post('vice_principal', person('y'))]),
    ]);
    expect(s.multiCollege.map((h) => h.user_id)).toEqual(['x']);
  });

  it('handles no colleges', () => {
    expect(computeLeadershipStats([]).coveragePct).toBe(0);
  });
});

describe('groupCoverage', () => {
  it('counts appointed group posts', async () => {
    const { groupCoverage } = await import('@/lib/organizations/leadership-stats');
    expect(groupCoverage([{ holder: person('md') }, { holder: null }])).toEqual({ filled: 1, total: 2 });
    expect(groupCoverage([])).toEqual({ filled: 0, total: 0 });
  });
});

describe('leader visuals', () => {
  it('builds initials, skipping honorifics', async () => {
    const { initialsOf } = await import('@/lib/organizations/leader-visuals');
    expect(initialsOf('Dr. Anitha K')).toBe('AK');
    expect(initialsOf('RAJENDIRAN K M')).toBe('RM');
    expect(initialsOf('Madhu')).toBe('M');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });

  it('gives one person one stable colour', async () => {
    const { avatarGradient } = await import('@/lib/organizations/leader-visuals');
    expect(avatarGradient('abc')).toBe(avatarGradient('abc'));
    expect(avatarGradient('abc')).toMatch(/^from-/);
  });
});
