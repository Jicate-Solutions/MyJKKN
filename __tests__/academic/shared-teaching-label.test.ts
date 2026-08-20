import { describe, it, expect } from 'vitest';
import {
  SHARED_TEACHING_LABELS,
  canSetSharedTeachingLabel,
  carriedForwardNote,
  describeSharedTeachingLabel,
  isSharedTeachingLabel,
  labellingInstitutionIdFor,
  otherCollegeNameOf,
  otherSideNotYetLabelledNote,
  otherSideOf,
  ownSideOf,
  readSharedTeachingSide,
  sharedTeachingRelationshipKey,
  sharedTeachingSideFor,
  summariseSharedTeachingLabels,
  type SharedTeachingLabelSide,
  type SharedTeachingRelationship
} from '@/lib/academic/shared-teaching-label';

// ---------------------------------------------------------------------------
// What must hold, and none of it throws when it breaks.
//
//   1. TWO VALUES, NOT THREE. The pair is enforced in the database by a CHECK
//      constraint; here it is enforced on the screen, so a control can never
//      offer a value the database will refuse and a value invented later can
//      never be printed as if a college had chosen it.
//   2. BOTH COLLEGES ANSWER (decision 5, 2026-08-18). The earlier rule let only
//      the receiving college speak, which made the lending college the subject
//      of a statement rather than a party to it and silently discarded any
//      disagreement between the two readings. Each side now holds its own row
//      and the two are allowed to differ.
//   3. NOBODY WRITES THE OTHER SIDE. Direction no longer decides WHETHER a
//      college may answer, only WHICH of the two rows is theirs. Picking the
//      wrong one would file an opinion in another college's name.
//   4. UNLABELLED IS ITS OWN STATE (decisions 9 and 12). Not a default to either
//      value, not a bare zero, and not a blank space — a blank beside one
//      college's answer reads as the other agreeing with it. Measured on
//      production 2026-08-20, the table holds zero rows, so this is the state
//      the screen spends all of its life in today.
//   5. AN OLD OR REVISED ANSWER SAYS SO (decisions 6 and 8). A carried-forward
//      answer must never pass as given fresh this year, and a corrected one must
//      never pass as never-corrected.
// ---------------------------------------------------------------------------

const side = (
  overrides: Partial<SharedTeachingLabelSide> = {}
): SharedTeachingLabelSide => ({
  label: 'planned_partnership',
  set_at: '2026-08-18T10:00:00.000Z',
  set_by_name: 'A Principal',
  edited_at: null,
  carried_forward_from_academic_year_id: null,
  carried_forward_from_academic_year_name: null,
  ...overrides
});

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
  giver_label: null,
  receiver_label: null,
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

describe('who may set a label — both colleges, since decision 5', () => {
  it('lets the receiving college answer for teaching it receives', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: true,
        direction: 'incoming'
      })
    ).toBe(true);
  });

  it('lets the LENDING college answer too — this is the decision-5 reversal', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: true,
        direction: 'outgoing'
      })
    ).toBe(true);
  });

  it('still refuses a viewer without the manage key, in either direction', () => {
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: false,
        direction: 'incoming'
      })
    ).toBe(false);
    expect(
      canSetSharedTeachingLabel({
        isSuperAdmin: false,
        canManage: false,
        direction: 'outgoing'
      })
    ).toBe(false);
  });

  it('lets a super admin answer in either direction, as everywhere else on the estate', () => {
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

describe('a college writes its OWN side and never the other', () => {
  it('puts a receiving college in the receiver seat', () => {
    expect(sharedTeachingSideFor('incoming')).toBe('receiver');
  });

  it('puts a lending college in the giver seat', () => {
    expect(sharedTeachingSideFor('outgoing')).toBe('giver');
  });

  it('stamps the receiving college as the author when it answers', () => {
    const row = relationship({ direction: 'incoming' });
    expect(labellingInstitutionIdFor(row)).toBe('allied');
    expect(labellingInstitutionIdFor(row)).not.toBe(row.giver_institution_id);
  });

  it('stamps the lending college as the author when it answers', () => {
    const row = relationship({ direction: 'outgoing' });
    expect(labellingInstitutionIdFor(row)).toBe('dental');
    expect(labellingInstitutionIdFor(row)).not.toBe(
      row.receiver_institution_id
    );
  });

  it('reads the viewer own/other sides the right way round in each direction', () => {
    const giverSaid = side({ label: 'planned_partnership' });
    const receiverSaid = side({ label: 'covering_a_shortage' });

    const asReceiver = relationship({
      direction: 'incoming',
      giver_label: giverSaid,
      receiver_label: receiverSaid
    });
    expect(ownSideOf(asReceiver)).toBe(receiverSaid);
    expect(otherSideOf(asReceiver)).toBe(giverSaid);
    expect(otherCollegeNameOf(asReceiver)).toBe('JKKN Dental College');

    const asGiver = relationship({
      direction: 'outgoing',
      giver_label: giverSaid,
      receiver_label: receiverSaid
    });
    expect(ownSideOf(asGiver)).toBe(giverSaid);
    expect(otherSideOf(asGiver)).toBe(receiverSaid);
    expect(otherCollegeNameOf(asGiver)).toBe('JKKN Allied Health Sciences');
  });

  it('keys a relationship independently of who is viewing it', () => {
    const asReceiver = relationship({ direction: 'incoming' });
    const asGiver = relationship({ direction: 'outgoing' });
    const key = (r: SharedTeachingRelationship) =>
      sharedTeachingRelationshipKey({
        giverInstitutionId: r.giver_institution_id,
        receiverInstitutionId: r.receiver_institution_id,
        academicYearId: r.academic_year_id
      });

    expect(key(asReceiver)).toBe(key(asGiver));
  });

  it('gives different relationships different keys, including across years', () => {
    const base = {
      giverInstitutionId: 'dental',
      receiverInstitutionId: 'allied',
      academicYearId: 'ay-2026'
    };
    expect(sharedTeachingRelationshipKey(base)).not.toBe(
      sharedTeachingRelationshipKey({ ...base, academicYearId: 'ay-2025' })
    );
    expect(sharedTeachingRelationshipKey(base)).not.toBe(
      sharedTeachingRelationshipKey({ ...base, giverInstitutionId: 'pharmacy' })
    );
  });
});

describe('the two answers are independent and may disagree', () => {
  it('keeps one side answered when the other has said nothing', () => {
    const row = relationship({
      direction: 'incoming',
      giver_label: side({ label: 'planned_partnership' }),
      receiver_label: null
    });

    expect(readSharedTeachingSide(row.giver_label).label).toBe(
      'planned_partnership'
    );
    expect(readSharedTeachingSide(row.receiver_label).state).toBe(
      'not-yet-labelled'
    );
  });

  it('records a disagreement as two answers rather than collapsing it', () => {
    const row = relationship({
      giver_label: side({ label: 'planned_partnership' }),
      receiver_label: side({ label: 'covering_a_shortage' })
    });

    expect(readSharedTeachingSide(row.giver_label).label).toBe(
      'planned_partnership'
    );
    expect(readSharedTeachingSide(row.receiver_label).label).toBe(
      'covering_a_shortage'
    );
  });

  it('reads an absent side as unanswered, never as an empty answer', () => {
    const reading = readSharedTeachingSide(null);
    expect(reading.state).toBe('not-yet-labelled');
    expect(reading.label).toBeNull();
    expect(reading.setByName).toBeNull();
    expect(reading.setAt).toBeNull();
  });

  it('reads a side carrying an unrecognised value as unanswered', () => {
    const reading = readSharedTeachingSide(side({ label: 'something_else' }));
    expect(reading.state).toBe('not-yet-labelled');
    expect(reading.label).toBeNull();
  });
});

describe('the other college’s silence is named, never left blank (decision 9)', () => {
  it('names the college that has not answered', () => {
    expect(otherSideNotYetLabelledNote('JKKN Dental College')).toBe(
      'JKKN Dental College has not labelled this yet.'
    );
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', '   ']
  ])('still says something when the name is %s', (_why, name) => {
    expect(otherSideNotYetLabelledNote(name)).toBe(
      'The other college has not labelled this yet.'
    );
  });
});

describe('a carried-forward answer says so (decision 8)', () => {
  it('names the year it came from', () => {
    expect(carriedForwardNote('2025-26')).toBe('Carried forward from 2025-26');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', '  ']
  ])('still marks it as carried forward when the year is %s', (_why, year) => {
    expect(carriedForwardNote(year)).toBe('Carried forward from last year');
  });

  it('flags a side brought forward from an earlier year', () => {
    const reading = readSharedTeachingSide(
      side({
        carried_forward_from_academic_year_id: 'ay-2025',
        carried_forward_from_academic_year_name: '2025-26'
      })
    );

    expect(reading.carriedForward).toBe(true);
    expect(reading.carriedForwardNote).toBe('Carried forward from 2025-26');
  });

  it('does not flag an answer given fresh for its own year', () => {
    const reading = readSharedTeachingSide(side());
    expect(reading.carriedForward).toBe(false);
    expect(reading.carriedForwardNote).toBeNull();
  });

  it('marks it carried forward even when the year name did not come back', () => {
    // The pointer is the fact; the name is a nicety. Losing the name must not
    // turn an old answer into one that looks given for this year.
    const reading = readSharedTeachingSide(
      side({
        carried_forward_from_academic_year_id: 'ay-2025',
        carried_forward_from_academic_year_name: null
      })
    );

    expect(reading.carriedForward).toBe(true);
    expect(reading.carriedForwardNote).toBe('Carried forward from last year');
  });
});

describe('a corrected answer says so (decision 6)', () => {
  it('reports an edited side as edited, and carries the time', () => {
    const reading = readSharedTeachingSide(
      side({ edited_at: '2026-08-19T09:00:00.000Z' })
    );

    expect(reading.edited).toBe(true);
    expect(reading.editedAt).toBe('2026-08-19T09:00:00.000Z');
  });

  it('reports an answer nobody has revised as not edited', () => {
    const reading = readSharedTeachingSide(side({ edited_at: null }));
    expect(reading.edited).toBe(false);
    expect(reading.editedAt).toBeNull();
  });

  it('does not treat an absent side as edited', () => {
    expect(readSharedTeachingSide(null).edited).toBe(false);
  });
});

describe('the tally counts absence rather than hiding it', () => {
  it('reports every relationship as unlabelled when neither side has answered', () => {
    // The state the cluster is actually in: zero rows on production 2026-08-20.
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
      notYetLabelled: 2,
      awaitingOtherCollege: 2
    });
  });

  it('counts the viewer own side, not the other college’s', () => {
    // Viewing as the receiver: our side is answered on both rows, theirs on
    // neither. Nothing outstanding for us; two still waiting on them.
    const rows = [
      relationship({ direction: 'incoming', receiver_label: side() }),
      relationship({
        direction: 'incoming',
        giver_institution_id: 'pharmacy',
        receiver_label: side({ label: 'covering_a_shortage' })
      })
    ];

    expect(summariseSharedTeachingLabels(rows)).toEqual({
      total: 2,
      labelled: 2,
      notYetLabelled: 0,
      awaitingOtherCollege: 2
    });
  });

  it('does not count the other college’s answer as ours', () => {
    // Only they have spoken. We still owe an answer on both rows.
    const rows = [
      relationship({ direction: 'incoming', giver_label: side() }),
      relationship({
        direction: 'outgoing',
        giver_institution_id: 'pharmacy',
        receiver_label: side()
      })
    ];

    expect(summariseSharedTeachingLabels(rows)).toEqual({
      total: 2,
      labelled: 0,
      notYetLabelled: 2,
      awaitingOtherCollege: 0
    });
  });

  it('counts a partly answered set without rounding either way', () => {
    const rows = [
      relationship({ direction: 'incoming', receiver_label: side() }),
      relationship({
        direction: 'incoming',
        giver_institution_id: 'pharmacy',
        receiver_label: side({ label: 'covering_a_shortage' })
      }),
      relationship({
        direction: 'incoming',
        giver_institution_id: 'engineering',
        receiver_label: null
      })
    ];

    expect(summariseSharedTeachingLabels(rows)).toMatchObject({
      total: 3,
      labelled: 2,
      notYetLabelled: 1
    });
  });

  it('does not count an unrecognised value as an answer', () => {
    const rows = [
      relationship({
        direction: 'incoming',
        receiver_label: side({ label: 'something_else' })
      })
    ];

    expect(summariseSharedTeachingLabels(rows)).toEqual({
      total: 1,
      labelled: 0,
      notYetLabelled: 1,
      awaitingOtherCollege: 1
    });
  });

  it('reports an empty list as zero of zero, never as fully answered', () => {
    expect(summariseSharedTeachingLabels([])).toEqual({
      total: 0,
      labelled: 0,
      notYetLabelled: 0,
      awaitingOtherCollege: 0
    });
  });
});
