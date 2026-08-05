// __tests__/director-desk/my-desk.test.ts
// ============================================================================
// Tests for the /my-desk receiving-side logic.
//
// The assertions state what a person should SEE, against hand-written
// fixtures — never by re-deriving the implementation's own arithmetic. A test
// that recomputes the rule it is checking proves only that the code agrees with
// itself (feedback_test_that_models_sql_proves_nothing).
//
// The heaviest weight is on readabilityVerdict, because that is the function
// standing between a colleague and the sentence "nothing has been handed to
// you" — a sentence the page must never say without evidence.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  accessIsLive,
  accessLevelWords,
  chunk,
  closedAt,
  closedReason,
  daysQuiet,
  daysUntil,
  describeAudit,
  describeDue,
  hasPermissionKeys,
  indexAudit,
  istToday,
  personName,
  probeAnswered,
  readabilityVerdict,
  splitDesk,
  type AuditRow,
  type HandoverRow,
} from '@/app/(routes)/my-desk/_lib/desk';

const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DIRECTOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TODAY = '2026-08-05';

function handover(over: Partial<HandoverRow> & { id: string }): HandoverRow {
  return {
    route: '/accreditation/naac',
    title: 'NAAC criterion 3 evidence',
    note: null,
    permission_keys: ['accreditation.view'],
    access_level: 'update',
    grantee_user_id: ME,
    granted_by: DIRECTOR,
    institution_id: null,
    status: 'pending',
    due_date: '2026-08-20',
    responded_at: null,
    decline_reason: null,
    completed_at: null,
    revoked_at: null,
    last_activity_at: '2026-08-05T04:00:00.000Z',
    created_at: '2026-08-01T04:00:00.000Z',
    updated_at: '2026-08-01T04:00:00.000Z',
    ...over,
  };
}

function audit(over: Partial<AuditRow> & { id: string }): AuditRow {
  return {
    handover_id: 'h1',
    action: 'created',
    actor_user_id: DIRECTOR,
    detail: {},
    created_at: '2026-08-01T04:00:00.000Z',
    ...over,
  };
}

// ---------------------------------------------------------------------------
describe('daysUntil / describeDue', () => {
  it('counts a future date forwards and a past date backwards', () => {
    expect(daysUntil('2026-08-20', TODAY)).toBe(15);
    expect(daysUntil('2026-08-05', TODAY)).toBe(0);
    expect(daysUntil('2026-08-01', TODAY)).toBe(-4);
  });

  it('crosses a month boundary without drifting', () => {
    expect(daysUntil('2026-09-01', '2026-08-31')).toBe(1);
    expect(daysUntil('2026-03-01', '2026-02-28')).toBe(1); // 2026 is not a leap year
  });

  it('says "due today" rather than "0 days left"', () => {
    expect(describeDue(TODAY, TODAY)).toMatchObject({ label: 'due today', tone: 'soon' });
  });

  it('names how far past the date something is, not just that it is late', () => {
    expect(describeDue('2026-08-04', TODAY)).toMatchObject({
      label: '1 day past the date',
      tone: 'past',
    });
    expect(describeDue('2026-07-29', TODAY).label).toBe('7 days past the date');
  });

  it('is calm about a distant date and pointed about a near one', () => {
    expect(describeDue('2026-08-30', TODAY).tone).toBe('calm');
    expect(describeDue('2026-08-07', TODAY).tone).toBe('soon');
  });
});

describe('daysQuiet', () => {
  it('distinguishes "never recorded" from "quiet for zero days"', () => {
    expect(daysQuiet(null, '2026-08-05T00:00:00.000Z')).toBeNull();
    expect(daysQuiet('2026-08-05T00:00:00.000Z', '2026-08-05T06:00:00.000Z')).toBe(0);
  });

  it('counts whole days since the last activity', () => {
    expect(daysQuiet('2026-07-29T00:00:00.000Z', '2026-08-05T00:00:00.000Z')).toBe(7);
  });
});

// ---------------------------------------------------------------------------
describe('accessIsLive', () => {
  it('is open while pending — you must be able to look before you answer', () => {
    expect(accessIsLive(handover({ id: 'h1', status: 'pending' }), TODAY)).toBe(true);
  });

  it('is open once accepted', () => {
    expect(accessIsLive(handover({ id: 'h1', status: 'accepted' }), TODAY)).toBe(true);
  });

  it('is CLOSED on an accepted row whose date has passed, before any sweep relabels it', () => {
    // This is the shape that would otherwise send somebody into an
    // access-denied panel from a button that looked live.
    const stale = handover({ id: 'h1', status: 'accepted', due_date: '2026-08-01' });
    expect(stale.status).toBe('accepted');
    expect(accessIsLive(stale, TODAY)).toBe(false);
  });

  it('is open on the due date itself — the day is inclusive', () => {
    expect(accessIsLive(handover({ id: 'h1', due_date: TODAY }), TODAY)).toBe(true);
  });

  it('is closed once revoked, whatever the status column still says', () => {
    const revoked = handover({
      id: 'h1',
      status: 'accepted',
      revoked_at: '2026-08-04T10:00:00.000Z',
    });
    expect(accessIsLive(revoked, TODAY)).toBe(false);
  });

  it('is closed for every ended status', () => {
    for (const status of ['declined', 'done', 'revoked', 'expired', 'orphaned']) {
      expect(accessIsLive(handover({ id: 'h1', status }), TODAY)).toBe(false);
    }
  });

  it('is closed when the row names no permission — it would unlock nothing', () => {
    expect(accessIsLive(handover({ id: 'h1', permission_keys: [] }), TODAY)).toBe(false);
    expect(accessIsLive(handover({ id: 'h1', permission_keys: null }), TODAY)).toBe(false);
    expect(hasPermissionKeys(handover({ id: 'h1', permission_keys: [] }))).toBe(false);
    expect(hasPermissionKeys(handover({ id: 'h1' }))).toBe(true);
  });

  it('is closed — not "due today" — when the date cannot be read', () => {
    // A zero-on-unparseable daysUntil would read as due today AND as an open
    // door: an answer fabricated from a value nobody could parse.
    expect(daysUntil('not-a-date', TODAY)).toBeNaN();
    expect(describeDue('not-a-date', TODAY).label).toBe('no usable date');
    expect(accessIsLive(handover({ id: 'h1', due_date: 'not-a-date' }), TODAY)).toBe(false);
  });
});

describe('accessLevelWords', () => {
  it('tells a watcher they cannot change anything', () => {
    expect(accessLevelWords('watch').detail).toMatch(/cannot change anything/i);
  });

  it('tells an updater they cannot create or delete', () => {
    expect(accessLevelWords('update').detail).toMatch(/cannot create new records or delete/i);
  });

  it('does not silently treat an unknown level as full access', () => {
    const words = accessLevelWords('superuser');
    expect(words.title).not.toBe(accessLevelWords('full').title);
    expect(words.detail).toMatch(/does not know/i);
  });
});

// ---------------------------------------------------------------------------
describe('splitDesk', () => {
  const rows: HandoverRow[] = [
    handover({ id: 'pending-late', status: 'pending', due_date: '2026-08-30' }),
    handover({ id: 'pending-soon', status: 'pending', due_date: '2026-08-06' }),
    handover({ id: 'mine', status: 'accepted', due_date: '2026-08-10' }),
    handover({
      id: 'done-recent',
      status: 'done',
      completed_at: '2026-08-03T09:00:00.000Z',
    }),
    handover({
      id: 'declined-old',
      status: 'declined',
      responded_at: '2026-05-01T09:00:00.000Z',
    }),
  ];

  it('puts what needs an answer in its own bucket', () => {
    const { awaitingAnswer } = splitDesk(rows, TODAY);
    expect(awaitingAnswer.map((r) => r.id)).toEqual(['pending-soon', 'pending-late']);
  });

  it('sorts open work by the nearest date first', () => {
    const { awaitingAnswer } = splitDesk(rows, TODAY);
    expect(awaitingAnswer[0].id).toBe('pending-soon');
  });

  it('lists only recently-closed items and counts the rest', () => {
    const { recentlyClosed, olderClosedCount } = splitDesk(rows, TODAY);
    expect(recentlyClosed.map((r) => r.id)).toEqual(['done-recent']);
    expect(olderClosedCount).toBe(1);
  });

  it('never loses a row between the buckets', () => {
    const b = splitDesk(rows, TODAY);
    expect(
      b.awaitingAnswer.length + b.mine.length + b.recentlyClosed.length + b.olderClosedCount,
    ).toBe(rows.length);
  });

  it('does not mutate the array it was given', () => {
    const input = [...rows];
    splitDesk(input, TODAY);
    expect(input.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
});

describe('closedAt / closedReason', () => {
  it('is null while the item is still open', () => {
    expect(closedAt(handover({ id: 'h1', status: 'accepted' }))).toBeNull();
  });

  it('prefers the completion time over the row timestamps', () => {
    const row = handover({
      id: 'h1',
      status: 'done',
      completed_at: '2026-08-03T09:00:00.000Z',
      updated_at: '2026-08-04T09:00:00.000Z',
    });
    expect(closedAt(row)).toBe('2026-08-03T09:00:00.000Z');
  });

  it('explains an orphaned item as an account change, not a failure by the person', () => {
    expect(closedReason(handover({ id: 'h1', status: 'orphaned' }))).toMatch(/account changed/i);
  });
});

// ---------------------------------------------------------------------------
describe('audit trail', () => {
  it('shows the newest entry first', () => {
    const indexed = indexAudit([
      audit({ id: 'a1', created_at: '2026-08-01T04:00:00.000Z', action: 'created' }),
      audit({ id: 'a2', created_at: '2026-08-04T04:00:00.000Z', action: 'progress' }),
      audit({ id: 'a3', created_at: '2026-08-02T04:00:00.000Z', action: 'accepted' }),
    ]);
    expect(indexed.h1.map((r) => r.id)).toEqual(['a2', 'a3', 'a1']);
  });

  it('keeps each handover trail separate', () => {
    const indexed = indexAudit([
      audit({ id: 'a1', handover_id: 'h1' }),
      audit({ id: 'a2', handover_id: 'h2' }),
    ]);
    expect(Object.keys(indexed).sort()).toEqual(['h1', 'h2']);
  });

  it('carries the decline reason through to the trail', () => {
    const line = describeAudit(
      audit({ id: 'a1', action: 'declined', detail: { reason: 'Already on two of these' } }),
    );
    expect(line.body).toBe('Already on two of these');
  });

  it('ignores a detail blob of the wrong shape rather than rendering junk', () => {
    const line = describeAudit(audit({ id: 'a1', action: 'progress', detail: { note: 42 } as never }));
    expect(line.body).toBeNull();
  });

  it('treats a blank note as no note', () => {
    const line = describeAudit(audit({ id: 'a1', action: 'progress', detail: { note: '   ' } }));
    expect(line.body).toBeNull();
  });

  it('falls back to the raw action rather than inventing a sentence', () => {
    expect(describeAudit(audit({ id: 'a1', action: 'chased' })).headline).toBe('chased');
  });
});

describe('personName', () => {
  const people = {
    [DIRECTOR]: {
      person_id: DIRECTOR,
      person_name: 'A. Director',
      person_email: 'director@jkkn.ac.in',
      person_designation: 'Director',
    },
  };

  it('uses the name when there is one', () => {
    expect(personName(people, DIRECTOR)).toBe('A. Director');
  });

  it('falls back to the email rather than to a uuid', () => {
    const nameless = {
      [DIRECTOR]: { ...people[DIRECTOR], person_name: null },
    };
    expect(personName(nameless, DIRECTOR)).toBe('director@jkkn.ac.in');
  });

  it('returns null for somebody it has no record of — never the raw id', () => {
    expect(personName(people, 'cccccccc-cccc-cccc-cccc-cccccccccccc')).toBeNull();
    expect(personName(undefined, DIRECTOR)).toBeNull();
    expect(personName(people, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('chunk — the audit id list must not become a 19KB URL', () => {
  it('splits into groups no larger than the size', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const groups = chunk(ids, 100);
    expect(groups.map((g) => g.length)).toEqual([100, 100, 50]);
  });

  it('loses nothing and reorders nothing', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(chunk(ids, 2).flat()).toEqual(ids);
  });

  it('returns no groups for no ids, so no pointless request is made', () => {
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('probeAnswered', () => {
  it('treats "checked: false" as no answer — that is the probe saying it could not identify me', () => {
    expect(probeAnswered({ checked: false })).toBe(false);
  });

  it('treats a missing count as no answer', () => {
    expect(probeAnswered({ checked: true })).toBe(false);
    expect(probeAnswered(null)).toBe(false);
    expect(probeAnswered(undefined)).toBe(false);
  });

  it('accepts a real count, including zero', () => {
    expect(probeAnswered({ checked: true, total_count: 0 })).toBe(true);
    expect(probeAnswered({ checked: true, total_count: 4 })).toBe(true);
  });
});

describe('readabilityVerdict — the page may not claim what it did not read', () => {
  it('NEVER calls the desk empty on an unidentified caller', () => {
    // fn_my_desk_probe answers {checked:false} with no auth.uid(). If that were
    // read as data, total_count would be absent-as-zero and an expired token
    // would render "Nothing has been handed to you. We checked." — the one
    // sentence this design exists to never get wrong.
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: { checked: false },
      visibleCount: 0,
    });
    expect(v.kind).toBe('unknown');
    expect(v.kind).not.toBe('empty');
  });

  it('blames its OWN row limit, never a permission rule, when the list was capped', () => {
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: { checked: true, total_count: 900 },
      visibleCount: 500,
      listCapped: true,
    });
    expect(v).toMatchObject({ kind: 'capped', expected: 900, visible: 500 });
  });

  it('still reports a real disagreement when the list was NOT capped', () => {
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: { checked: true, total_count: 900 },
      visibleCount: 500,
      listCapped: false,
    });
    expect(v.kind).toBe('partial');
  });

  it('does not report "capped" when the cap was hit but the counts agree', () => {
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: { checked: true, total_count: 500 },
      visibleCount: 500,
      listCapped: true,
    });
    expect(v.kind).toBe('ok');
  });

  it('will not vouch for a list the probe never checked, even with rows on screen', () => {
    expect(
      readabilityVerdict({
        rowsFailed: false,
        probeFailed: true,
        probe: null,
        visibleCount: 4,
      }).kind,
    ).toBe('unknown');
  });

  it('claims nothing at all when neither read worked', () => {
    expect(
      readabilityVerdict({ rowsFailed: true, probeFailed: true, probe: null, visibleCount: 0 }),
    ).toMatchObject({ kind: 'unavailable' });
  });

  it('will not call the desk empty when the list read failed, even with a good probe', () => {
    const v = readabilityVerdict({
      rowsFailed: true,
      probeFailed: false,
      probe: { total_count: 0 },
      visibleCount: 0,
    });
    expect(v.kind).toBe('unknown');
  });

  it('will not call the desk empty on a silent zero-row read the probe could not confirm', () => {
    // This IS the failure this function exists for: RLS denial returns zero
    // rows with error === null, indistinguishable from a genuinely empty desk.
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: true,
      probe: null,
      visibleCount: 0,
    });
    expect(v.kind).toBe('unknown');
    expect(v.kind).not.toBe('empty');
  });

  it('calls the desk empty only when the probe positively confirms it', () => {
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: { checked: true, total_count: 0, open_count: 0, closed_count: 0 },
      visibleCount: 0,
    });
    expect(v).toMatchObject({ kind: 'empty', expected: 0, visible: 0 });
  });

  it('flags hidden rows when the probe counts more than the list shows', () => {
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: { total_count: 5 },
      visibleCount: 2,
    });
    expect(v).toMatchObject({ kind: 'partial', expected: 5, visible: 2 });
  });

  it('is satisfied when the two reads agree', () => {
    expect(
      readabilityVerdict({
        rowsFailed: false,
        probeFailed: false,
        probe: { total_count: 3 },
        visibleCount: 3,
      }),
    ).toMatchObject({ kind: 'ok' });
  });

  it('does not cry "hidden rows" when the list somehow shows more than the probe counted', () => {
    // A row created between the two reads. Extra rows are not a denial.
    expect(
      readabilityVerdict({
        rowsFailed: false,
        probeFailed: false,
        probe: { total_count: 2 },
        visibleCount: 3,
      }).kind,
    ).toBe('ok');
  });

  it('treats a probe that answered without a count as no answer', () => {
    const v = readabilityVerdict({
      rowsFailed: false,
      probeFailed: false,
      probe: {} as never,
      visibleCount: 0,
    });
    expect(v.kind).toBe('unknown');
  });

});

describe('istToday', () => {
  it('uses the college calendar, not the viewer’s', () => {
    // 20:00 UTC on the 4th is already 01:30 on the 5th in India. A viewer in
    // London must see the same "days left" as the door actually honours.
    expect(istToday(new Date('2026-08-04T20:00:00.000Z'))).toBe('2026-08-05');
    expect(istToday(new Date('2026-08-04T17:00:00.000Z'))).toBe('2026-08-04');
  });
});
