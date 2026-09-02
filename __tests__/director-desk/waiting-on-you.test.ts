// __tests__/director-desk/waiting-on-you.test.ts
// ============================================================================
// Tests for the "Waiting on you" section of /my-desk.
//
// The assertions state what a person SEES, against hand-written rows — never
// by re-deriving the implementation's own arithmetic. A test that recomputes
// the rule it is checking proves only that the code agrees with itself
// (feedback_test_that_models_sql_proves_nothing).
//
// The heaviest weight is on emptyVerdict, because that is the function
// standing between the Director and the sentence "nothing is waiting on you"
// — a sentence the page must never say off a check that did not happen.
//
// NOTE: __tests__/director-desk is NOT run by CI (every workflow names explicit
// paths). Run locally: npx vitest run __tests__/director-desk/waiting-on-you.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  ageChipClasses,
  ageTone,
  ageWords,
  checkedAtWords,
  describeError,
  emptyVerdict,
  formatRupees,
  groupBySource,
  isCapped,
  oldestAgeDays,
  queuesChecked,
  sourceWords,
  summaryLine,
  WAITING_ROW_CAP,
  WAITING_SOURCES,
  type WaitingRow,
} from '@/app/(routes)/my-desk/_lib/waiting';

/** 07:12 IST on 2026-09-03 is 01:42Z. */
const CHECKED_AT = '2026-09-03T01:42:00.000Z';

function row(over: Partial<WaitingRow> & { item_id: string }): WaitingRow {
  return {
    source: 'refund',
    title: 'Refund for A. Learner',
    detail: 'Withdrawn before term start',
    amount: null,
    waiting_since: '2026-08-01T04:00:00.000Z',
    age_days: 33,
    href: '/billing/refunds',
    ...over,
  };
}

describe('sourceWords — the five queues have plain names', () => {
  it('names each known queue with a heading and a verb', () => {
    expect(sourceWords('recruitment')).toMatchObject({ label: 'Hires to sign off', verb: 'Sign off' });
    expect(sourceWords('refund')).toMatchObject({ label: 'Refunds to approve', verb: 'Approve' });
    expect(sourceWords('leave')).toMatchObject({ label: 'Leave to approve', verb: 'Approve' });
    expect(sourceWords('meeting_trigger')).toMatchObject({ label: 'Triggers to decide', verb: 'Decide' });
    expect(sourceWords('grievance')).toMatchObject({ label: 'Grievances to assign', verb: 'Assign' });
  });

  it('does not crash on a queue this page has never heard of', () => {
    const w = sourceWords('purchase_order');
    expect(w.label).toBe('Purchase order to act on');
    expect(w.verb).toBe('Open');
  });
});

describe('ageWords', () => {
  it('reads today / 1 day / n days', () => {
    expect(ageWords(0)).toBe('today');
    expect(ageWords(1)).toBe('1 day');
    expect(ageWords(3)).toBe('3 days');
    expect(ageWords(48)).toBe('48 days');
  });

  it('never turns a missing age into "today"', () => {
    expect(ageWords(null)).toBe('age unknown');
    expect(ageWords(Number.NaN)).toBe('age unknown');
    expect(ageWords(-2)).toBe('age unknown');
  });
});

describe('age chip bands — red at 30, amber at 7, neutral below', () => {
  it('6 days is neutral, 7 days is amber', () => {
    expect(ageTone(6)).toBe('fresh');
    expect(ageChipClasses(ageTone(6))).toContain('text-muted-foreground');
    expect(ageChipClasses(ageTone(6))).not.toMatch(/amber|red/);

    expect(ageTone(7)).toBe('aging');
    expect(ageChipClasses(ageTone(7))).toContain('text-amber-800');
  });

  it('29 days is amber, 30 days is red', () => {
    expect(ageTone(29)).toBe('aging');
    expect(ageChipClasses(ageTone(29))).toContain('text-amber-800');

    expect(ageTone(30)).toBe('old');
    expect(ageChipClasses(ageTone(30))).toContain('text-red-700');
  });

  it('each band also carries a dark-mode colour', () => {
    expect(ageChipClasses('old')).toContain('dark:text-red-300');
    expect(ageChipClasses('aging')).toContain('dark:text-amber-300');
  });
});

describe('formatRupees — Indian grouping', () => {
  it('54500 reads as ₹54,500', () => {
    expect(formatRupees(54500)).toBe('₹54,500');
  });

  it('groups lakhs and crores the Indian way', () => {
    expect(formatRupees(500)).toBe('₹500');
    expect(formatRupees(1000)).toBe('₹1,000');
    expect(formatRupees(5450000)).toBe('₹54,50,000');
    expect(formatRupees(438500000)).toBe('₹43,85,00,000');
  });

  it('shows paise only when there are any', () => {
    expect(formatRupees(1234.5)).toBe('₹1,234.50');
    expect(formatRupees(1234.0)).toBe('₹1,234');
  });

  it('does not print a number it cannot format', () => {
    expect(formatRupees(Number.NaN)).toBe('₹—');
  });
});

describe('checkedAtWords — the Indian clock', () => {
  it('01:42Z reads as 07:12', () => {
    expect(checkedAtWords(CHECKED_AT)).toBe('07:12');
    expect(checkedAtWords(Date.parse(CHECKED_AT))).toBe('07:12');
  });

  it('an unusable time is said to be unknown', () => {
    expect(checkedAtWords('not a time')).toBe('time unknown');
    // React Query's "never fetched" stamp must not print as 05:30.
    expect(checkedAtWords(0)).toBe('time unknown');
  });
});

describe('groupBySource — oldest first, inside and between groups', () => {
  const rows: WaitingRow[] = [
    row({ item_id: 'g1', source: 'grievance', waiting_since: '2026-08-20T00:00:00Z', age_days: 14, href: '/grievances' }),
    row({ item_id: 'r1', source: 'recruitment', waiting_since: '2026-07-21T00:00:00Z', age_days: 44, href: '/hr/recruitment' }),
    row({ item_id: 'f1', source: 'refund', waiting_since: '2026-08-28T00:00:00Z', age_days: 6, amount: 54500 }),
    row({ item_id: 'r2', source: 'recruitment', waiting_since: '2026-07-25T00:00:00Z', age_days: 40, href: '/hr/recruitment' }),
    row({ item_id: 'f2', source: 'refund', waiting_since: '2026-07-29T00:00:00Z', age_days: 36, amount: 12000 }),
  ];

  it('orders the groups by their oldest item', () => {
    const groups = groupBySource(rows);
    expect(groups.map((g) => g.source)).toEqual(['recruitment', 'refund', 'grievance']);
  });

  it('keeps the oldest item first inside each group', () => {
    const groups = groupBySource(rows);
    expect(groups[0].rows.map((r) => r.item_id)).toEqual(['r1', 'r2']);
    expect(groups[1].rows.map((r) => r.item_id)).toEqual(['f2', 'f1']);
  });

  it('does not trust the answer to arrive sorted', () => {
    const shuffled = [rows[2], rows[0], rows[4], rows[3], rows[1]];
    expect(groupBySource(shuffled)).toEqual(groupBySource(rows));
  });

  it('loses no row and invents none', () => {
    const groups = groupBySource(rows);
    const seen = groups.flatMap((g) => g.rows.map((r) => r.item_id)).sort();
    expect(seen).toEqual(['f1', 'f2', 'g1', 'r1', 'r2']);
  });

  it('an empty answer is an empty list of groups', () => {
    expect(groupBySource([])).toEqual([]);
  });
});

describe('summaryLine', () => {
  it('counts, names the oldest, and says when it checked', () => {
    const rows = [
      row({ item_id: 'a', age_days: 48 }),
      row({ item_id: 'b', age_days: 3 }),
      row({ item_id: 'c', age_days: 0 }),
    ];
    expect(summaryLine(rows, CHECKED_AT)).toBe('3 items waiting · oldest 48 days · checked 07:12');
  });

  it('uses the singular for one item', () => {
    expect(summaryLine([row({ item_id: 'a', age_days: 1 })], CHECKED_AT)).toBe(
      '1 item waiting · oldest 1 day · checked 07:12',
    );
  });

  it('oldestAgeDays ignores an unusable age rather than treating it as zero', () => {
    expect(oldestAgeDays([row({ item_id: 'a', age_days: Number.NaN }), row({ item_id: 'b', age_days: 5 })])).toBe(5);
    expect(oldestAgeDays([])).toBeNull();
  });
});

describe('emptyVerdict — the page may not claim what it did not check', () => {
  it('the all-clear names all five queues and the time', () => {
    const sentence = emptyVerdict({ kind: 'empty', checkedAt: CHECKED_AT });
    expect(sentence).toBe(
      'Nothing waiting across 5 queues (hires, refunds, leave, triggers, grievances) — checked 07:12',
    );
    expect(WAITING_SOURCES).toHaveLength(5);
    expect(queuesChecked()).toContain('5 queues');
  });

  it('the failure says it could not check, and never reads as nothing waiting', () => {
    const sentence = emptyVerdict({ kind: 'error', reason: 'the request did not come back' });
    expect(sentence.startsWith('Could not check what is waiting on you')).toBe(true);
    expect(sentence).toContain('the request did not come back');
    expect(sentence.toLowerCase()).not.toContain('nothing waiting');
    expect(sentence.toLowerCase()).not.toContain('nothing is waiting');
  });

  it('the two sentences can never be confused for each other', () => {
    const ok = emptyVerdict({ kind: 'empty', checkedAt: CHECKED_AT });
    const bad = emptyVerdict({ kind: 'error', reason: 'x' });
    expect(ok).not.toContain('Could not check');
    expect(bad).not.toContain('Nothing waiting');
  });
});

describe('describeError — the function-not-installed case is said plainly', () => {
  it('a PostgREST schema-cache miss on fn_my_desk_waiting reads as "not installed yet"', () => {
    const err = new Error(
      'Could not find the function public.fn_my_desk_waiting without parameters in the schema cache',
    );
    expect(describeError(err)).toContain('not installed yet');
    expect(emptyVerdict({ kind: 'error', reason: describeError(err) })).toContain(
      'Could not check what is waiting on you',
    );
  });

  it('any other error is quoted as it arrived, not guessed at', () => {
    expect(describeError(new Error('permission denied for function'))).toBe(
      'permission denied for function',
    );
    expect(describeError({ message: 'timeout' })).toBe('timeout');
  });

  it('an error with no words still gets a reason', () => {
    expect(describeError(undefined)).toBe('the request did not come back');
    expect(describeError({})).toBe('the request did not come back');
  });
});

describe('isCapped — at the ceiling the list is a floor', () => {
  it('flags a full answer and not a short one', () => {
    const full = Array.from({ length: WAITING_ROW_CAP }, (_, i) => row({ item_id: `i${i}` }));
    expect(isCapped(full)).toBe(true);
    expect(isCapped(full.slice(0, -1))).toBe(false);
  });
});
