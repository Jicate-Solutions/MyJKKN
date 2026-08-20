import { describe, it, expect } from 'vitest';
import {
  SHARED_TEACHING_LABELS,
  canSetSharedTeachingLabel,
  describeSharedTeachingLabel,
  isSharedTeachingLabel,
  summariseSharedTeachingLabels,
  type SharedTeachingRelationship
} from '@/lib/academic/shared-teaching-label';

// ---------------------------------------------------------------------------
// Three things must hold, and none of them throws when it breaks.
//
//   1. TWO VALUES, NOT THREE. The pair is enforced in the database by a CHECK
//      constraint; here it is enforced on the screen, so a control can never
//      offer a value the database will refuse and a value invented later can
//      never be printed as if a college had chosen it.
//   2. THE RECEIVER ANSWERS. "Covering a shortage" is a sentence about the
//      receiving college's own staffing. A lending college holding the manage
//      key must not be able to write it on their behalf — and RLS refuses
//      silently (zero rows, error: null), so a control offered wrongly here
//      looks like it worked.
//   3. UNLABELLED IS ITS OWN STATE. Not a default to either value, not a bare
//      zero. Measured on production 2026-08-14, every one of the cluster's
//      teaching relationships is in exactly this state, so it is the state the
//      screen spends most of its life in.
// ---------------------------------------------------------------------------

const relationship = (
  overrides: Partial<SharedTeachingRelationship> = {}
): SharedTeachingRelationship => ({
  giver_institution_id: 'dental',
  giver_name: 'JKKN Dental College',
  receiver_institution_id: 'allied',
  receiver_name: 'JKKN Allied Health Sciences',
  academic_year_id: 'ay-2026',
  academic_year_name: '2026-27',
  assignments: 53,
  people: 9,
  direction: 'incoming',
  label: null,
  label_set_at: null,
  label_set_by_name: null,
  ...overrides
});

describe('the two label values, and only those two', () => {
  it('offers exactly planned_partnership and covering_a_shortage', () => {
    expect([...SHARED_TEACHING_LABELS]).toEqual([
      'planned_partnership',
      'covering_a_shortage'
    ]);
  });

  it.each(['planned_partnership', 'covering_a_shortage'])(
    'accepts %s',
    (value) => {
      expect(isSharedTeachingLabel(value)).toBe(true);
    }
  );

  it.each([
    ['a third value someone added later', 'shared_resource'],
    ['the same word in another shape', 'Covering a shortage'],
    ['trailing whitespace', 'covering_a_shortage '],
    ['the empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 1],
    ['an object', { label: 'planned_partnership' }]
  ])('refuses %s', (_why, value) => {
    expect(isSharedTeachingLabel(value)).toBe(false);
  });
});

describe('an unlabelled relationship reads as unlabelled', () => {
  it('reports null as its own state, not as either value', () => {
    const described = describeSharedTeachingLabel(null);
    expect(described.state).toBe('not-yet-labelled');
    expect(described.label).toBeNull();
    expect(described.title).toBe('Not yet labelled');
  });

  it('never resolves an absent label to planned_partnership', () => {
    expect(describeSharedTeachingLabel(null).label).not.toBe(
      'planned_partnership'
    );
    expect(describeSharedTeachingLabel(undefined).label).not.toBe(
      'planned_partnership'
    );
  });

  it('never resolves an absent label to covering_a_shortage', () => {
    expect(describeSharedTeachingLabel(null).label).not.toBe(
      'covering_a_shortage'
    );
    expect(describeSharedTeachingLabel(undefined).label).not.toBe(
      'covering_a_shortage'
    );
  });

  it('treats an unrecognised stored value as unanswered rather than guessing', () => {
    const described = describeSharedTeachingLabel('planned-partnership');
    expect(described.state).toBe('not-yet-labelled');
    expect(described.label).toBeNull();
  });

  it('reports each stored value with its own copy', () => {
    expect(describeSharedTeachingLabel('planned_partnership')).toMatchObject({
      state: 'labelled',
      label: 'planned_partnership',
      title: 'Planned partnership'
    });
    expect(describeSharedTeachingLabel('covering_a_shortage')).toMatchObject({
      state: 'labelled',
      label: 'covering_a_shortage',
      title: 'Covering a shortage'
    });
  });
});

describe('who may set a label', () => {
  it('lets the receiving college answer for teaching it receives', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: true,
        direction: 'incoming'
      })
    ).toBe(true);
  });

  it('refuses the lending college, even holding the manage key', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: true,
        direction: 'outgoing'
      })
    ).toBe(false);
  });

  it('refuses a viewer without the manage key on their own incoming teaching', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: false,
        direction: 'incoming'
      })
    ).toBe(false);
  });

  it('lets a super admin set either direction, as everywhere else on the estate', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: true,
        canManage: false,
        direction: 'outgoing'
      })
    ).toBe(true);
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: true,
        canManage: false,
        direction: 'incoming'
      })
    ).toBe(true);
  });
});

describe('the tally counts absence rather than hiding it', () => {
  it('reports every relationship as unlabelled when none has been answered', () => {
    // The state the cluster is actually in as of 2026-08-14.
    const rows = [
      relationship(),
      relationship({
        giver_institution_id: 'pharmacy',
        giver_name: 'JKKN College of Pharmacy',
        assignments: 12,
        people: 3
      })
    ];

    expect(summariseSharedTeachingLabels(rows)).toEqual({
      total: 2,
      labelled: 0,
      notYetLabelled: 2
    });
  });

  it('counts a partly answered set without rounding either way', () => {
    const rows = [
      relationship({ label: 'planned_partnership' }),
      relationship({
        giver_institution_id: 'pharmacy',
        label: 'covering_a_shortage'
      }),
      relationship({ giver_institution_id: 'engineering', label: null })
    ];

    expect(summariseSharedTeachingLabels(rows)).toEqual({
      total: 3,
      labelled: 2,
      notYetLabelled: 1
    });
  });

  it('does not count an unrecognised value as an answer', () => {
    const rows = [relationship({ label: 'something_else' })];

    expect(summariseSharedTeachingLabels(rows)).toEqual({
      total: 1,
      labelled: 0,
      notYetLabelled: 1
    });
  });

  it('reports an empty list as zero of zero, never as fully answered', () => {
    expect(summariseSharedTeachingLabels([])).toEqual({
      total: 0,
      labelled: 0,
      notYetLabelled: 0
    });
  });
});
