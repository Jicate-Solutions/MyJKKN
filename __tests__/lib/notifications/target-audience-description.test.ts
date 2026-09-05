/**
 * Notifications — the Target Audience label on the admin detail page.
 *
 * The bug this pins: the label was derived from the structural targeting keys
 * only, so a notification sent to exactly one person read "All Users". On
 * production 2026-08-18 that fallthrough covered 298,554 of 298,874
 * notifications — the reader could not tell "one learner" from "all eight
 * colleges", which is the misreading that precedes an accidental mass send.
 *
 * Every targeting object below is a real shape copied from production, and the
 * counts in the names are the real bucket boundaries (largest live recipient
 * list: 273).
 */
import { describe, it, expect } from 'vitest';
import {
  describeTargetAudience,
  formatRecipientSummary,
  getTargetedUserIds,
  getTargetRoleKeys,
  TARGET_NAME_PREVIEW_LIMIT
} from '@/lib/notifications/target-audience';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i));

describe('describeTargetAudience — the four production shapes', () => {
  it('1 recipient reads as that person, never "All Users"', () => {
    const label = describeTargetAudience({
      user_ids: [id(1)],
      user_names: ['Priya R.']
    });
    expect(label).toBe('Priya R.');
    expect(label).not.toBe('All Users');
  });

  it('3 recipients read as two names and a singular "1 other"', () => {
    expect(
      describeTargetAudience({
        user_ids: ids(3),
        user_names: ['Priya R.', 'Arun K.']
      })
    ).toBe('Priya R., Arun K. and 1 other');
  });

  it('273 recipients — the largest live list — read as two names and the rest', () => {
    expect(
      describeTargetAudience({
        user_ids: ids(273),
        user_names: ['Priya R.', 'Arun K.']
      })
    ).toBe('Priya R., Arun K. and 271 others');
  });

  it('a genuinely broad send still reads "All Users"', () => {
    // Exactly one production row has empty targeting. This is the only shape
    // 'All Users' may describe.
    expect(describeTargetAudience({})).toBe('All Users');
    expect(describeTargetAudience(null)).toBe('All Users');
    expect(
      describeTargetAudience({ user_ids: [], target_roles: [], roles: [] })
    ).toBe('All Users');
  });
});

describe('describeTargetAudience — every production key set is truthful', () => {
  // The exact top-level key sets found on production 2026-08-18. None of these
  // may read 'All Users': each one names somebody.
  const productionShapes: Array<[string, Record<string, unknown>]> = [
    ['user_ids', { user_ids: ids(1), user_names: ['Priya R.'] }],
    ['type,user_id', { type: 'user', user_id: id(1), user_names: ['Priya R.'] }],
    ['type,user_ids', { type: 'user', user_ids: ids(3), user_names: ['Priya R.'] }],
    ['target_users', { target_users: ids(1), user_names: ['Priya R.'] }],
    ['type,roles', { type: 'role', roles: ['super_admin'] }],
    ['target_roles', { target_roles: ['hod'] }],
    ['institution_id,target_roles', { institution_id: id(1), target_roles: ['hod'] }],
    [
      'department_id,institution_id,target_roles',
      { department_id: id(2), institution_id: id(1), target_roles: ['hod'] }
    ],
    ['audience_ids', { audience_ids: ids(2) }]
  ];

  it.each(productionShapes)('%s never reads "All Users"', (_label, targeting) => {
    const label = describeTargetAudience(targeting);
    expect(label).not.toBe('All Users');
    expect(label.trim().length).toBeGreaterThan(0);
  });

  it('a saved-audience send is named, not called a broadcast', () => {
    expect(describeTargetAudience({ audience_ids: ids(2) })).toBe('Saved audience');
  });
});

describe('describeTargetAudience — structural targeting is untouched', () => {
  it('keeps the existing arrow-joined structural label', () => {
    expect(
      describeTargetAudience({
        institution_id: id(1),
        department_id: id(2),
        program_id: id(3),
        semester_id: id(4),
        section_id: id(5),
        target_roles: ['hod']
      })
    ).toBe('Institution → Department → Program → Semester → Section → Roles');
  });

  it('names people FIRST but never drops the structural filter', () => {
    const label = describeTargetAudience({
      user_ids: ids(3),
      user_names: ['Priya R.', 'Arun K.'],
      institution_id: id(9)
    });
    expect(label).toBe('Priya R., Arun K. and 1 other → Institution');
    expect(label).toContain('Institution');
  });
});

describe('getTargetedUserIds — both person shapes', () => {
  it('reads the canonical user_ids array', () => {
    expect(getTargetedUserIds({ user_ids: [id(1), id(2)] })).toEqual([id(1), id(2)]);
  });

  it('reads the singular user_id shape (3,192 live rows)', () => {
    expect(getTargetedUserIds({ type: 'user', user_id: id(7) })).toEqual([id(7)]);
    expect(describeTargetAudience({ type: 'user', user_id: id(7) })).not.toBe(
      'All Users'
    );
  });

  it('reads the target_users shape (4 live rows)', () => {
    expect(getTargetedUserIds({ target_users: [id(3), id(4)] })).toEqual([
      id(3),
      id(4)
    ]);
  });

  it('ignores blanks, non-strings and duplicates', () => {
    expect(
      getTargetedUserIds({
        user_ids: [id(1), '  ', id(1), null, 42, ` ${id(2)} `] as never
      })
    ).toEqual([id(1), id(2)]);
  });

  it('names nobody when nobody is named', () => {
    expect(getTargetedUserIds({})).toEqual([]);
    expect(getTargetedUserIds({ user_ids: [], user_id: '' })).toEqual([]);
    expect(getTargetedUserIds(undefined)).toEqual([]);
  });
});

describe('getTargetRoleKeys — both role shapes', () => {
  it('prefers target_roles, falls back to the legacy roles key', () => {
    expect(getTargetRoleKeys({ target_roles: ['hod'] })).toEqual(['hod']);
    expect(getTargetRoleKeys({ type: 'role', roles: ['super_admin'] })).toEqual([
      'super_admin'
    ]);
  });

  it('a { type: role, roles: [...] } send no longer reads "All Users"', () => {
    expect(describeTargetAudience({ type: 'role', roles: ['super_admin'] })).toBe(
      'Roles'
    );
  });
});

describe('formatRecipientSummary — collapse boundaries', () => {
  it('collapses at 1, 2 and 3+', () => {
    expect(formatRecipientSummary(['Priya R.'], 1)).toBe('Priya R.');
    expect(formatRecipientSummary(['Priya R.', 'Arun K.'], 2)).toBe(
      'Priya R. and Arun K.'
    );
    expect(formatRecipientSummary(['Priya R.', 'Arun K.'], 3)).toBe(
      'Priya R., Arun K. and 1 other'
    );
  });

  it('degrades to an honest count when no name resolves', () => {
    expect(formatRecipientSummary([], 1)).toBe('1 person');
    expect(formatRecipientSummary(['   ', null, undefined], 273)).toBe('273 people');
    expect(formatRecipientSummary(undefined, 4)).toBe('4 people');
  });

  it('never renders an empty label for a real recipient list', () => {
    for (const total of [1, 2, 3, 10, 273]) {
      expect(formatRecipientSummary([], total).length).toBeGreaterThan(0);
    }
  });

  it('shows no more names than the preview limit the API fetches', () => {
    const summary = formatRecipientSummary(
      ['A A', 'B B', 'C C', 'D D'],
      273
    );
    expect(summary).toBe('A A, B B and 271 others');
    expect(TARGET_NAME_PREVIEW_LIMIT).toBe(2);
  });

  it('returns nothing when there are no recipients at all', () => {
    expect(formatRecipientSummary(['Priya R.'], 0)).toBe('');
  });
});
