// __tests__/campus-walk/report-card.test.ts
// ============================================================================
// The Monday report card (Director ruling 2026-06-30), tested at the level of
// what each number is supposed to MEAN. Pure functions — no database.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  buildReportCards,
  directorBellBody,
  headBellBody,
  headBellTitle,
  isFixedOnTime,
  isLateAt,
  isRepeatInWeek,
  lastCompletedWeekStart,
  parseWeekParam,
  reportsInWeek,
  weekFromMonday,
  type ComplaintRow
} from '@/lib/campus-walk/report-card';
import type { WalkTaskRow } from '@/lib/campus-walk/scoreboard';

const ARTS = 'inst-arts';
const ENGG = 'inst-engg';
const NURSING = 'inst-nursing';
const COLLEGES = [
  { id: ARTS, name: 'Arts College' },
  { id: ENGG, name: 'Engineering College' },
  { id: NURSING, name: 'Nursing College' }
];

// Week of Mon 22 Jun 2026 – Sun 28 Jun 2026 (IST).
const WEEK = weekFromMonday('2026-06-22');
// The Monday the cron runs: 29 Jun 2026, 08:07 IST.
const MONDAY_RUN = new Date('2026-06-29T02:37:00Z');

let seq = 0;
function task(overrides: Partial<WalkTaskRow> & { metadata?: Record<string, any> }): WalkTaskRow {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `job ${seq}`,
    status_key: 'todo',
    is_blocked: false,
    due_date: '2026-06-30',
    completed_at: null,
    created_at: '2026-06-23T05:00:00Z',
    owner_staff_id: null,
    ...overrides,
    metadata: { source: 'campus-walk', institution_id: ARTS, ...(overrides.metadata ?? {}) }
  };
}

function fixed(
  completedAt: string,
  overrides: Partial<WalkTaskRow> & { metadata?: Record<string, any> } = {}
): WalkTaskRow {
  return task({
    status_key: 'done',
    completed_at: completedAt,
    ...overrides,
    metadata: { fix: { approval: { state: 'approved' } }, ...(overrides.metadata ?? {}) }
  });
}

function complaint(overrides: Partial<ComplaintRow>): ComplaintRow {
  return {
    institution_id: ARTS,
    status: 'open',
    created_at: '2026-06-23T05:00:00Z',
    resolved_at: null,
    sla_deadline: '2026-07-10T00:00:00Z',
    withdrawn_at: null,
    is_icc_only: false,
    ...overrides
  };
}

function cardFor(board: ReturnType<typeof buildReportCards>, id: string) {
  const c = board.cards.find((x) => x.institutionId === id);
  if (!c) throw new Error(`no card for ${id}`);
  return c;
}

describe('the week', () => {
  it('reports the last FULL Monday-to-Sunday week in IST', () => {
    expect(lastCompletedWeekStart(MONDAY_RUN)).toBe('2026-06-22');
    // Sunday night 23:59 IST is still inside the week being reported on…
    expect(lastCompletedWeekStart(new Date('2026-06-28T18:29:00Z'))).toBe('2026-06-15');
    // …and one minute later (Monday 00:00 IST) that week has finished.
    expect(lastCompletedWeekStart(new Date('2026-06-28T18:30:00Z'))).toBe('2026-06-22');
  });

  it('moves a date that is not a Monday back to its Monday, and says so', () => {
    const p = parseWeekParam('2026-06-25', MONDAY_RUN);
    expect(p.week?.weekStart).toBe('2026-06-22');
    expect(p.week?.weekEnd).toBe('2026-06-28');
    expect(p.snapped).toBe(true);
    expect(parseWeekParam('2026-06-22', MONDAY_RUN).snapped).toBe(false);
  });

  it('refuses anything that is not a real date rather than guessing', () => {
    expect(parseWeekParam('last-week', MONDAY_RUN).week).toBeNull();
    expect(parseWeekParam('2026-02-30', MONDAY_RUN).week).toBeNull();
  });

  it('flags the current, unfinished week', () => {
    expect(parseWeekParam('2026-06-29', MONDAY_RUN).notFinished).toBe(true);
    expect(parseWeekParam('2026-06-22', MONDAY_RUN).notFinished).toBe(false);
  });
});

describe('fixed and fixed on time', () => {
  it('counts only an APPROVED fix whose approval landed in the week', () => {
    const board = buildReportCards({
      colleges: COLLEGES,
      tasks: [
        fixed('2026-06-24T06:00:00Z'),
        // status done but no approved photo — not a verified closure
        task({ status_key: 'done', completed_at: '2026-06-24T06:00:00Z' }),
        // approved, but the week before
        fixed('2026-06-19T06:00:00Z')
      ],
      complaints: [],
      week: WEEK,
      now: MONDAY_RUN
    });
    expect(cardFor(board, ARTS).fixed).toBe(1);
  });

  it('compares the fix day with the due day as UTC days, like the fixes board', () => {
    expect(isFixedOnTime(fixed('2026-06-24T23:00:00Z', { due_date: '2026-06-24' }))).toBe(true);
    expect(isFixedOnTime(fixed('2026-06-25T00:30:00Z', { due_date: '2026-06-24' }))).toBe(false);
  });

  it('leaves the on-time percentage empty (not zero) when nothing was fixed', () => {
    const board = buildReportCards({
      colleges: COLLEGES,
      tasks: [],
      complaints: [],
      week: WEEK,
      now: MONDAY_RUN
    });
    expect(cardFor(board, ARTS).fixedOnTimePct).toBeNull();
    expect(cardFor(board, ARTS).rankOnTime).toBeNull();
  });

  it('uses the median days to fix, with paused days removed', () => {
    const board = buildReportCards({
      colleges: COLLEGES,
      tasks: [
        fixed('2026-06-24T05:00:00Z', { created_at: '2026-06-22T05:00:00Z' }), // 2 days
        fixed('2026-06-25T05:00:00Z', {
          created_at: '2026-06-15T05:00:00Z', // 10 days, 6 of them paused → 4
          metadata: { sla: { paused_days_total: 6 } }
        }),
        fixed('2026-06-26T05:00:00Z', { created_at: '2026-06-20T05:00:00Z' }) // 6 days
      ],
      complaints: [],
      week: WEEK,
      now: MONDAY_RUN
    });
    expect(cardFor(board, ARTS).typicalDaysToFix).toBe(4);
  });
});

describe('late now', () => {
  it('is open at the end of the week with its due day already gone', () => {
    const asOf = new Date(WEEK.endMs - 1);
    expect(isLateAt(task({ due_date: '2026-06-27' }), asOf)).toBe(true);
    // due on the last day of the week is not yet late
    expect(isLateAt(task({ due_date: '2026-06-28' }), asOf)).toBe(false);
  });

  it('does not count a job that was fixed after the week ended as late — it was open then', () => {
    const lateThenFixed = fixed('2026-07-01T05:00:00Z', { due_date: '2026-06-25' });
    expect(isLateAt(lateThenFixed, new Date(WEEK.endMs - 1))).toBe(true);
  });

  it('a blocked job (waiting on a budget decision or leave) is never late', () => {
    const blocked = task({ due_date: '2026-06-20', is_blocked: true });
    expect(isLateAt(blocked, new Date(WEEK.endMs - 1))).toBe(false);
    const board = buildReportCards({
      colleges: COLLEGES,
      tasks: [blocked],
      complaints: [],
      week: WEEK,
      now: MONDAY_RUN
    });
    expect(cardFor(board, ARTS).lateNow).toBe(0);
    expect(cardFor(board, ARTS).oldestOpenDays).toBeNull();
  });

  it('never guesses a closed-at-an-unknown-time job is open', () => {
    const noTimestamp = task({ status_key: 'done', completed_at: null, due_date: '2026-06-01' });
    expect(isLateAt(noTimestamp, new Date(WEEK.endMs - 1))).toBe(false);
  });

  it('uses metadata.cancelled_at for a cancelled job', () => {
    const cancelledLate = task({
      status_key: 'cancelled',
      due_date: '2026-06-20',
      metadata: { cancelled_at: '2026-06-26T05:00:00Z' }
    });
    expect(isLateAt(cancelledLate, new Date(WEEK.endMs - 1))).toBe(false);
  });
});

describe('reports received and repeats', () => {
  it('counts the first filing and every "same as before" reopen in the week', () => {
    const t = task({
      created_at: '2026-05-01T05:00:00Z',
      metadata: {
        occurrences: [{ at: '2026-06-23T05:00:00Z' }, { at: '2026-06-27T05:00:00Z' }]
      }
    });
    expect(reportsInWeek(t, WEEK)).toBe(2);
  });

  it('a "same as before" reopen this week is a repeat', () => {
    const t = task({
      created_at: '2026-05-01T05:00:00Z',
      metadata: { occurrences: [{ at: '2026-06-23T05:00:00Z' }] }
    });
    expect(isRepeatInWeek(t, [t], WEEK)).toBe(true);
  });

  it('a new report at the same place, same kind, within 90 days of a fix is a repeat', () => {
    const earlier = fixed('2026-05-10T05:00:00Z', {
      created_at: '2026-05-05T05:00:00Z',
      metadata: { location: 'Block C  first floor', category: 'Plumbing' }
    });
    const again = task({ metadata: { location: 'block c first floor', category: 'plumbing' } });
    expect(isRepeatInWeek(again, [earlier, again], WEEK)).toBe(true);
  });

  it('is not a repeat when the kind differs, the fix is older than 90 days, or the place is unknown', () => {
    const differentKind = fixed('2026-05-10T05:00:00Z', {
      metadata: { location: 'Block C', category: 'electrical' }
    });
    const tooOld = fixed('2026-03-01T05:00:00Z', {
      metadata: { location: 'Block C', category: 'plumbing' }
    });
    const again = task({ metadata: { location: 'Block C', category: 'plumbing' } });
    expect(isRepeatInWeek(again, [differentKind, tooOld, again], WEEK)).toBe(false);

    const nowhere = task({ metadata: { category: 'plumbing' } });
    const nowhereBefore = fixed('2026-05-10T05:00:00Z', { metadata: { category: 'plumbing' } });
    expect(isRepeatInWeek(nowhere, [nowhereBefore, nowhere], WEEK)).toBe(false);
  });

  it('a "Not fixed" reopen (metadata.reopens) is not counted as a repeat', () => {
    const t = task({
      created_at: '2026-05-01T05:00:00Z',
      metadata: { reopens: [{ at: '2026-06-23T05:00:00Z' }] }
    });
    expect(isRepeatInWeek(t, [t], WEEK)).toBe(false);
  });

  it('matches walk photos by the ~110 m GPS square when there is no typed place', () => {
    const earlier = fixed('2026-06-01T05:00:00Z', {
      metadata: { geo: { lat: 11.40012, lng: 77.73001 }, kind: 'symptom' }
    });
    const again = task({ metadata: { geo: { lat: 11.40049, lng: 77.73038 }, kind: 'symptom' } });
    expect(isRepeatInWeek(again, [earlier, again], WEEK)).toBe(true);
  });
});

describe('complaints', () => {
  it('counts received, resolved and overdue — and never an ICC-only complaint', () => {
    const board = buildReportCards({
      colleges: COLLEGES,
      tasks: [],
      complaints: [
        complaint({}),
        complaint({ status: 'resolved', resolved_at: '2026-06-25T05:00:00Z', created_at: '2026-06-10T05:00:00Z' }),
        complaint({ created_at: '2026-06-01T05:00:00Z', sla_deadline: '2026-06-15T00:00:00Z' }),
        complaint({ is_icc_only: true }),
        complaint({ is_icc_only: true, created_at: '2026-06-01T05:00:00Z', sla_deadline: '2026-06-02T00:00:00Z' })
      ],
      week: WEEK,
      now: MONDAY_RUN
    });
    const arts = cardFor(board, ARTS);
    expect(arts.complaintsReceived).toBe(1);
    expect(arts.complaintsResolved).toBe(1);
    expect(arts.complaintsOverdue).toBe(1);
  });

  it('a withdrawn complaint is not overdue', () => {
    const board = buildReportCards({
      colleges: COLLEGES,
      tasks: [],
      complaints: [
        complaint({
          created_at: '2026-06-01T05:00:00Z',
          sla_deadline: '2026-06-05T00:00:00Z',
          status: 'withdrawn',
          withdrawn_at: '2026-06-06T00:00:00Z'
        })
      ],
      week: WEEK,
      now: MONDAY_RUN
    });
    expect(cardFor(board, ARTS).complaintsOverdue).toBe(0);
  });
});

describe('comparison with the other colleges', () => {
  const board = buildReportCards({
    colleges: COLLEGES,
    tasks: [
      // Arts: 2 fixed, both on time; 1 late
      fixed('2026-06-24T05:00:00Z', { due_date: '2026-06-30' }),
      fixed('2026-06-24T05:00:00Z', { due_date: '2026-06-30' }),
      task({ due_date: '2026-06-20' }),
      // Engineering: 2 fixed, 1 on time; 3 late
      fixed('2026-06-24T05:00:00Z', { due_date: '2026-06-30', metadata: { institution_id: ENGG } }),
      fixed('2026-06-24T05:00:00Z', { due_date: '2026-06-22', metadata: { institution_id: ENGG } }),
      task({ due_date: '2026-06-20', metadata: { institution_id: ENGG } }),
      task({ due_date: '2026-06-20', metadata: { institution_id: ENGG } }),
      task({ due_date: '2026-06-20', metadata: { institution_id: ENGG } }),
      // InstaSolver report stamped only with the reporter's college
      task({ due_date: '2026-06-20', metadata: { institution_id: null, reporter_institution_id: NURSING } }),
      // No college at all — never dropped, lands in the Director-only bucket
      task({ due_date: '2026-06-20', metadata: { institution_id: null } })
    ],
    complaints: [],
    week: WEEK,
    now: MONDAY_RUN
  });

  it('ranks fixed-on-time (higher is better) among colleges that fixed something', () => {
    expect(cardFor(board, ARTS).rankOnTime).toBe(1);
    expect(cardFor(board, ENGG).rankOnTime).toBe(2);
    expect(cardFor(board, NURSING).rankOnTime).toBeNull();
    expect(board.rankedOnTimeCount).toBe(2);
  });

  it('ranks late-now (fewer is better), with ties sharing a place', () => {
    expect(cardFor(board, ARTS).lateNow).toBe(1);
    expect(cardFor(board, NURSING).lateNow).toBe(1);
    expect(cardFor(board, ARTS).rankLate).toBe(1);
    expect(cardFor(board, NURSING).rankLate).toBe(1);
    expect(cardFor(board, ENGG).rankLate).toBe(3);
  });

  it('keeps a job with no college in its own bucket instead of dropping it', () => {
    expect(board.unassigned.lateNow).toBe(1);
    expect(board.cards.map((c) => c.name)).toEqual([
      'Arts College',
      'Engineering College',
      'Nursing College'
    ]);
  });

  it('leaves the star-rating row out while no ratings source exists', () => {
    expect(board.cards.every((c) => c.ratings === null)).toBe(true);
  });
});

describe('bell words', () => {
  const board = buildReportCards({
    colleges: COLLEGES,
    tasks: [
      fixed('2026-06-24T05:00:00Z', { due_date: '2026-06-30' }),
      task({ due_date: '2026-06-20' }),
      task({ due_date: '2026-06-20' })
    ],
    complaints: [],
    week: WEEK,
    now: MONDAY_RUN
  });
  const arts = cardFor(board, ARTS);

  it('uses the ruling title', () => {
    expect(headBellTitle(arts)).toBe("Your college's week: 1 fixed, 2 late");
  });

  it('gives the three biggest numbers in words, then where the college stands', () => {
    expect(headBellBody(arts, board.rankedOnTimeCount)).toBe(
      '3 problems reported, 2 jobs past the date, 1 job fixed. On time: 1st of 1 college that fixed something. Open the card to see every college.'
    );
  });

  it("names every college with no head in the Director's summary", () => {
    const body = directorBellBody(board, [{ id: NURSING, name: 'Nursing College' }]);
    expect(body).toContain('Arts College: 1 fixed, 2 late, 0 came back');
    expect(body).toContain('No head on record: Nursing College');
  });
});
