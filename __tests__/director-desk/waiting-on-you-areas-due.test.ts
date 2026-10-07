// __tests__/director-desk/waiting-on-you-areas-due.test.ts
// ============================================================================
// The two things migration 20270613101149 asked of the page:
//   1. seventeen queues must stay readable on a phone — grouped by AREA in a
//      fixed order, oldest first inside each area;
//   2. every row may carry a stored deadline (due_at), shown as "due in / overdue"
//      next to its age — and a row with none shows nothing, never a guess.
//
// Assertions state what a person SEES against hand-written rows and clocks.
// Run locally: npx vitest run __tests__/director-desk/waiting-on-you-areas-due.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  areaOf,
  dueChipClasses,
  dueLabel,
  groupByArea,
  sourceWords,
  WAITING_AREAS,
  WAITING_SOURCES,
  type WaitingRow,
} from '@/app/(routes)/my-desk/_lib/waiting';

function row(over: Partial<WaitingRow> & { item_id: string }): WaitingRow {
  return {
    source: 'refund',
    title: 'Refund for A. Learner',
    detail: 'pinned to you by name',
    amount: null,
    waiting_since: '2026-09-01T00:00:00.000Z',
    age_days: 30,
    href: '/billing/refunds',
    due_at: null,
    ...over,
  };
}

/** 07:12 IST on 2026-10-01. */
const NOW = '2026-10-01T01:42:00.000Z';

describe('areas — seventeen queues under seven fixed headings', () => {
  it('the headings are fixed and read in this order', () => {
    expect([...WAITING_AREAS]).toEqual([
      'Recruitment',
      'Leave',
      'Attendance',
      'Payroll',
      'Team member records',
      'Governance',
      'Other',
    ]);
  });

  it('puts each queue in the area a reader would look for it', () => {
    expect(areaOf('recruitment')).toBe('Recruitment');
    expect(areaOf('offer')).toBe('Recruitment');
    expect(areaOf('onboarding_step')).toBe('Recruitment');
    expect(areaOf('leave')).toBe('Leave');
    expect(areaOf('comp_off')).toBe('Leave');
    expect(areaOf('leave_eligibility')).toBe('Leave');
    expect(areaOf('regularisation')).toBe('Attendance');
    expect(areaOf('attendance_close')).toBe('Attendance');
    expect(areaOf('salary_revision')).toBe('Payroll');
    expect(areaOf('payroll_period')).toBe('Payroll');
    expect(areaOf('staff_photo')).toBe('Team member records');
    expect(areaOf('employee_document')).toBe('Team member records');
    expect(areaOf('promotion')).toBe('Governance');
    expect(areaOf('termination')).toBe('Governance');
    expect(areaOf('refund')).toBe('Other');
    expect(areaOf('meeting_trigger')).toBe('Other');
    expect(areaOf('grievance')).toBe('Other');
  });

  it('a queue this page has never heard of, or no queue at all, is "Other" — never dropped', () => {
    expect(areaOf('purchase_order')).toBe('Other');
    expect(areaOf(null)).toBe('Other');
    expect(areaOf(undefined)).toBe('Other');
    expect(areaOf('')).toBe('Other');
  });

  it('every known queue has its own heading words, and no two share a queue word', () => {
    for (const s of WAITING_SOURCES) {
      const w = sourceWords(s);
      expect(w.label, s).not.toBe('Other');
      expect(w.label, s).not.toMatch(/to act on$/);
    }
    const words = WAITING_SOURCES.map((s) => sourceWords(s).queue);
    expect(new Set(words).size).toBe(words.length);
  });

  it('names the new HR queues in plain words', () => {
    expect(sourceWords('comp_off').label).toBe('Comp-off claims to decide');
    expect(sourceWords('regularisation').label).toBe('Attendance corrections to approve');
    expect(sourceWords('attendance_close').label).toBe('Attendance months to close');
    expect(sourceWords('employee_document').label).toBe('Documents to verify');
    expect(sourceWords('onboarding_step').label).toBe('Onboarding steps for you');
  });

  const rows: WaitingRow[] = [
    row({ item_id: 'g1', source: 'grievance', waiting_since: '2026-08-01T00:00:00Z' }),
    row({ item_id: 'c1', source: 'comp_off', waiting_since: '2026-09-21T00:00:00Z' }),
    row({ item_id: 'l1', source: 'leave', waiting_since: '2026-09-27T00:00:00Z' }),
    row({ item_id: 'e1', source: 'leave_eligibility', waiting_since: '2026-09-10T00:00:00Z' }),
    row({ item_id: 'p1', source: 'staff_photo', waiting_since: '2026-09-25T00:00:00Z' }),
    row({ item_id: 'r1', source: 'recruitment', waiting_since: '2026-09-20T00:00:00Z' }),
    row({ item_id: 'x1', source: 'purchase_order', waiting_since: '2026-07-01T00:00:00Z' }),
  ];

  it('orders the areas by the fixed list, not by their oldest row, and skips empty ones', () => {
    // The grievance (Other) is the oldest row here, yet Other still reads last:
    // a reader learns where to look once.
    expect(groupByArea(rows).map((g) => g.area)).toEqual([
      'Recruitment',
      'Leave',
      'Team member records',
      'Other',
    ]);
  });

  it('inside an area the oldest row is first, whatever queue it came from', () => {
    const leave = groupByArea(rows).find((g) => g.area === 'Leave')!;
    expect(leave.rows.map((r) => r.item_id)).toEqual(['e1', 'c1', 'l1']);
    const other = groupByArea(rows).find((g) => g.area === 'Other')!;
    expect(other.rows.map((r) => r.item_id)).toEqual(['x1', 'g1']);
  });

  it('does not trust the answer to arrive sorted, loses no row and invents none', () => {
    const shuffled = [rows[3], rows[6], rows[0], rows[5], rows[2], rows[4], rows[1]];
    expect(groupByArea(shuffled)).toEqual(groupByArea(rows));
    const seen = groupByArea(rows).flatMap((g) => g.rows.map((r) => r.item_id)).sort();
    expect(seen).toEqual(['c1', 'e1', 'g1', 'l1', 'p1', 'r1', 'x1']);
  });

  it('an unparsable date sorts last inside its area', () => {
    const g = groupByArea([
      row({ item_id: 'bad', source: 'leave', waiting_since: 'not a date' }),
      row({ item_id: 'ok', source: 'leave', waiting_since: '2026-09-01T00:00:00Z' }),
    ]);
    expect(g[0].rows.map((r) => r.item_id)).toEqual(['ok', 'bad']);
  });

  it('a payload that is not a list groups to nothing; junk rows are skipped', () => {
    expect(groupByArea(null)).toEqual([]);
    expect(groupByArea({ rows: [] })).toEqual([]);
    expect(groupByArea([null, 'junk', 7])).toEqual([]);
    expect(groupByArea([])).toEqual([]);
  });
});

describe('dueLabel — the stored deadline, on the same clock as the age', () => {
  it('no deadline stored reads as nothing at all, never a guess', () => {
    expect(dueLabel(null, NOW)).toBeNull();
    expect(dueLabel(undefined, NOW)).toBeNull();
    expect(dueLabel('not a date', NOW)).toBeNull();
  });

  it('no clock yet (the never-fetched 0 stamp) reads as nothing', () => {
    expect(dueLabel('2026-10-05T00:00:00Z', 0)).toBeNull();
  });

  it('a passed deadline is overdue, in whole days past it', () => {
    expect(dueLabel('2026-09-29T01:42:00Z', NOW)).toEqual({ words: 'overdue 2 days', tone: 'overdue' });
    expect(dueLabel('2026-09-30T01:00:00Z', NOW)).toEqual({ words: 'overdue 1 day', tone: 'overdue' });
  });

  it('passed by less than a day is just "overdue", not "overdue 0 days"', () => {
    expect(dueLabel('2026-10-01T01:00:00Z', NOW)).toEqual({ words: 'overdue', tone: 'overdue' });
  });

  it('inside the next 24 hours reads in hours and is amber', () => {
    expect(dueLabel('2026-10-01T06:42:00Z', NOW)).toEqual({ words: 'due in 5 hours', tone: 'soon' });
    expect(dueLabel('2026-10-01T02:12:00Z', NOW)).toEqual({ words: 'due in 1 hour', tone: 'soon' });
  });

  it('further out reads in whole days and is neutral', () => {
    expect(dueLabel('2026-10-03T01:42:00Z', NOW)).toEqual({ words: 'due in 2 days', tone: 'later' });
    expect(dueLabel('2026-10-02T02:00:00Z', NOW)).toEqual({ words: 'due in 1 day', tone: 'later' });
  });

  it('a comp-off claim due at the end of 20 Oct (IST) reads 19 days out on 1 Oct', () => {
    // fn_my_desk_waiting emits end-of-expires_on on the Indian clock.
    expect(dueLabel('2026-10-20T18:30:00Z', NOW)?.words).toBe('due in 19 days');
  });

  it('each tone carries a light AND a dark colour; overdue is red, soon is amber', () => {
    expect(dueChipClasses('overdue')).toMatch(/text-red-600/);
    expect(dueChipClasses('overdue')).toMatch(/dark:text-red-400/);
    expect(dueChipClasses('soon')).toMatch(/text-amber-700/);
    expect(dueChipClasses('soon')).toMatch(/dark:text-amber-400/);
    expect(dueChipClasses('later')).toBe('border-muted-foreground/30 text-muted-foreground');
  });
});
