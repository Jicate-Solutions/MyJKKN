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
// The fixtures mirror fn_my_desk_waiting() (migration 20261018020000): amount
// in rupees, hrefs exactly as the RPC emits them — /hr/recruitment/approvals,
// /billing/refunds, /hr/leave/approvals, /meetings/triggers,
// /learners-council/issues — LIMIT 500 with no truncation flag.
//
// NOTE: __tests__/director-desk is NOT run by CI (every workflow names explicit
// paths). Run locally: npx vitest run __tests__/director-desk/waiting-on-you*
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  ageChipClasses,
  ageDaysFrom,
  ageTone,
  ageWords,
  checkedAtWords,
  countWords,
  describeError,
  emptyVerdict,
  formatRupees,
  groupBySource,
  isCapped,
  oldestAgeDays,
  queuesChecked,
  renderState,
  rowAgeDays,
  safeHref,
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

describe('sourceWords — the six queues have plain names', () => {
  it('names each known queue with a heading and a verb', () => {
    expect(sourceWords('recruitment')).toMatchObject({ label: 'Hires to sign off', verb: 'Sign off' });
    expect(sourceWords('refund')).toMatchObject({ label: 'Refunds to approve', verb: 'Approve' });
    expect(sourceWords('leave')).toMatchObject({ label: 'Leave to approve', verb: 'Approve' });
    expect(sourceWords('meeting_trigger')).toMatchObject({ label: 'Triggers to decide', verb: 'Decide' });
    expect(sourceWords('grievance')).toMatchObject({ label: 'Grievances to assign', verb: 'Assign' });
    // Sixth source, added 2026-09-03 (migration 20261018030000): a hire whose
    // salary is agreed and whom nobody has started onboarding.
    expect(sourceWords('offer')).toMatchObject({
      label: 'Hires to bring on board',
      verb: 'Start onboarding',
    });
  });

  it('never names the queue for a status the product has never used', () => {
    // 'offer_issued' has zero rows in production and no control in app/
    // performs that transition, so no word a person reads may promise it.
    // The source STRING stays 'offer' — that is the applied RPC contract.
    const words = sourceWords('offer');
    expect(words.label).not.toMatch(/offer/i);
    expect(words.verb).not.toMatch(/offer/i);
    expect(words.queue).not.toMatch(/offer/i);
  });

  it('the offer queue word does not collide with the hires queue word', () => {
    // Both are recruitment rows. If they shared a word the all-clear sentence
    // would read "…(hires, refunds, leave, triggers, grievances, hires)".
    expect(sourceWords('offer').queue).not.toBe(sourceWords('recruitment').queue);
    const queues = WAITING_SOURCES.map((s) => sourceWords(s).queue);
    expect(new Set(queues).size).toBe(queues.length);
  });

  it('an offer row is its own group and never merges into the hires group', () => {
    // The Director's recruitment count must not move when offers appear on
    // other people's desks; on a desk that sees both, they must still read as
    // two separate queues.
    const rows = [
      row({ source: 'recruitment', item_id: 'r1', waiting_since: '2026-07-18T00:00:00Z' }),
      row({ source: 'offer', item_id: 'o1', waiting_since: '2026-04-02T08:24:23Z' }),
      row({ source: 'offer', item_id: 'o2', waiting_since: '2026-04-13T06:11:42Z' }),
    ];
    const groups = groupBySource(rows);
    expect(groups.map((g) => g.source)).toEqual(['offer', 'recruitment']);
    expect(groups[0].rows.map((r) => r.item_id)).toEqual(['o1', 'o2']);
    expect(groups[1].rows).toHaveLength(1);
  });

  it('both per-row hrefs an offer row can carry are linkable', () => {
    // 'offer' is the only source with a per-row href. The SQL emits the job
    // workspace when the candidate carries a uuid-shaped job_id (that page
    // gates "Start Onboarding" on status package_fixed) and falls back to the
    // candidate record when it does not. Both must pass the in-app check.
    expect(safeHref('/hr/recruitment/approvals/3eaf9017-156e-44e7-82fa-29c7193be9c2')).toBe(
      '/hr/recruitment/approvals/3eaf9017-156e-44e7-82fa-29c7193be9c2',
    );
    expect(safeHref('/hr/recruitment/candidates/2f1c8c8e-0000-4000-8000-000000000001')).toBe(
      '/hr/recruitment/candidates/2f1c8c8e-0000-4000-8000-000000000001',
    );
  });

  it('does not crash on a queue this page has never heard of', () => {
    const w = sourceWords('purchase_order');
    expect(w.label).toBe('Purchase order to act on');
    expect(w.verb).toBe('Open');
  });

  it('a missing, empty or non-string source reads as "Other" rather than throwing', () => {
    expect(sourceWords(null).label).toBe('Other');
    expect(sourceWords(undefined).label).toBe('Other');
    expect(sourceWords('').label).toBe('Other');
    expect(sourceWords('   ').label).toBe('Other');
    expect(sourceWords(42 as unknown as string).label).toBe('Other');
  });
});

describe('one clock — age comes from waiting_since, age_days is only a fallback', () => {
  const NOW = CHECKED_AT; // 2026-09-03T01:42Z

  it('ageDaysFrom floors whole days the way the database does', () => {
    expect(ageDaysFrom('2026-07-17T01:42:00.000Z', NOW)).toBe(48);
    expect(ageDaysFrom('2026-07-17T01:43:00.000Z', NOW)).toBe(47); // one minute short of 48
    expect(ageDaysFrom('2026-09-03T00:00:00.000Z', NOW)).toBe(0);
  });

  it('a clock a few seconds behind the server reads today, not -1', () => {
    expect(ageDaysFrom('2026-09-03T01:42:30.000Z', NOW)).toBe(0);
  });

  it('an unusable date or the never-fetched stamp gives no age', () => {
    expect(ageDaysFrom('not a date', NOW)).toBeNull();
    expect(ageDaysFrom(null, NOW)).toBeNull();
    expect(ageDaysFrom('2026-07-17T01:42:00.000Z', 0)).toBeNull();
  });

  it('when age_days and waiting_since DISAGREE, the screen uses waiting_since', () => {
    // The RPC said 2 days; the timestamp says 48. The timestamp wins.
    const r = row({ item_id: 'x', waiting_since: '2026-07-17T01:42:00.000Z', age_days: 2 });
    expect(rowAgeDays(r, NOW)).toBe(48);
    expect(ageWords(rowAgeDays(r, NOW))).toBe('48 days');
    expect(ageTone(rowAgeDays(r, NOW))).toBe('old');
    expect(summaryLine([r], NOW)).toBe('1 item waiting · oldest 48 days · checked 07:12');
  });

  it('falls back to age_days only when waiting_since is unusable', () => {
    expect(rowAgeDays(row({ item_id: 'x', waiting_since: 'garbage', age_days: 9 }), NOW)).toBe(9);
    expect(rowAgeDays(row({ item_id: 'x', waiting_since: '', age_days: 9 }), NOW)).toBe(9);
    expect(rowAgeDays(row({ item_id: 'x', waiting_since: 'garbage', age_days: Number.NaN }), NOW)).toBeNull();
    expect(rowAgeDays(row({ item_id: 'x', waiting_since: 'garbage', age_days: -3 }), NOW)).toBeNull();
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
    row({ item_id: 'g1', source: 'grievance', waiting_since: '2026-08-20T00:00:00Z', age_days: 14, href: '/learners-council/issues' }),
    row({ item_id: 'r1', source: 'recruitment', waiting_since: '2026-07-21T00:00:00Z', age_days: 44, href: '/hr/recruitment/approvals' }),
    row({ item_id: 'f1', source: 'refund', waiting_since: '2026-08-28T00:00:00Z', age_days: 6, amount: 54500 }),
    row({ item_id: 'r2', source: 'recruitment', waiting_since: '2026-07-25T00:00:00Z', age_days: 40, href: '/hr/recruitment/approvals' }),
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

  it('a payload that is not a list groups to nothing instead of throwing', () => {
    expect(groupBySource(null)).toEqual([]);
    expect(groupBySource(undefined)).toEqual([]);
    expect(groupBySource({ rows: [] })).toEqual([]);
    expect(groupBySource('[]')).toEqual([]);
  });

  it('a row with no source lands under "other"; a non-object row is skipped', () => {
    const groups = groupBySource([
      row({ item_id: 'n1', source: null as unknown as string }),
      null,
      'junk',
      row({ item_id: 'f1' }),
    ]);
    expect(groups.map((g) => g.source).sort()).toEqual(['other', 'refund']);
    expect(sourceWords(groups.find((g) => g.source === 'other')!.source).label).toBe('Other');
    expect(groups.flatMap((g) => g.rows.map((r) => r.item_id)).sort()).toEqual(['f1', 'n1']);
  });
});

describe('safeHref — only an in-app path is ever linked', () => {
  it('accepts exactly the paths the RPC emits', () => {
    for (const h of [
      '/hr/recruitment/approvals',
      '/billing/refunds',
      '/hr/leave/approvals',
      '/meetings/triggers',
      '/learners-council/issues',
    ]) {
      expect(safeHref(h)).toBe(h);
    }
  });

  it('refuses anything that is not a single-slash path', () => {
    expect(safeHref('//evil.example/x')).toBeNull();
    expect(safeHref('https://evil.example/x')).toBeNull();
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('billing/refunds')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(7)).toBeNull();
  });
});

describe('summaryLine', () => {
  it('counts, names the oldest (on the one clock), and says when it checked', () => {
    const rows = [
      // age_days deliberately WRONG on every row: the summary must not read it.
      row({ item_id: 'a', waiting_since: '2026-07-17T01:42:00.000Z', age_days: 5 }),
      row({ item_id: 'b', waiting_since: '2026-08-31T01:42:00.000Z', age_days: 99 }),
      row({ item_id: 'c', waiting_since: '2026-09-03T00:00:00.000Z', age_days: 1 }),
    ];
    expect(summaryLine(rows, CHECKED_AT)).toBe('3 items waiting · oldest 48 days · checked 07:12');
  });

  it('uses the singular for one item', () => {
    expect(summaryLine([row({ item_id: 'a', waiting_since: '2026-09-02T01:42:00.000Z' })], CHECKED_AT)).toBe(
      '1 item waiting · oldest 1 day · checked 07:12',
    );
  });

  it('oldestAgeDays ignores an unusable row rather than treating it as zero', () => {
    expect(
      oldestAgeDays(
        [
          row({ item_id: 'a', waiting_since: 'garbage', age_days: Number.NaN }),
          row({ item_id: 'b', waiting_since: '2026-08-29T01:42:00.000Z' }),
        ],
        CHECKED_AT,
      ),
    ).toBe(5);
    expect(oldestAgeDays([], CHECKED_AT)).toBeNull();
  });

  it('at the RPC LIMIT it says "first 500" and prints NO total', () => {
    const full = Array.from({ length: WAITING_ROW_CAP }, (_, i) => row({ item_id: `i${i}` }));
    const line = summaryLine(full, CHECKED_AT);
    expect(line.startsWith('Showing the first 500 — open the modules for the rest')).toBe(true);
    expect(line).not.toContain('500 items');
    expect(line).toContain('checked 07:12');
    expect(countWords(full)).toBe('500+');
  });

  it('below the LIMIT it prints the count', () => {
    const some = Array.from({ length: WAITING_ROW_CAP - 1 }, (_, i) => row({ item_id: `i${i}` }));
    expect(summaryLine(some, CHECKED_AT).startsWith('499 items waiting')).toBe(true);
    expect(countWords(some)).toBe('499');
  });
});

describe('emptyVerdict — the page may not claim what it did not check', () => {
  it('the all-clear names all six queues and the time', () => {
    const sentence = emptyVerdict({ kind: 'empty', checkedAt: CHECKED_AT });
    expect(sentence).toBe(
      'Nothing waiting across 6 queues (hires, refunds, leave, triggers, grievances, onboarding) — checked 07:12',
    );
    expect(WAITING_SOURCES).toHaveLength(6);
    expect(queuesChecked()).toContain('6 queues');
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

describe('renderState — the ONE rule that chooses what the section shows', () => {
  const pendingIdle = { status: 'pending', fetchStatus: 'idle', data: undefined, error: null };

  it('a PAUSED fetch (offline phone) is "paused" — never "empty"', () => {
    // react-query 5: isLoading = isPending && fetchStatus === 'fetching', so a
    // paused fetch has isLoading=false and data=undefined. Keyed on isLoading
    // this fell through to "nothing waiting". It must not.
    const paused = { status: 'pending', fetchStatus: 'paused', data: undefined, error: null };
    expect(renderState(paused)).toBe('paused');
    expect(renderState(paused)).not.toBe('empty');
  });

  it('a fetch in flight, or not started, is "loading"', () => {
    expect(renderState({ status: 'pending', fetchStatus: 'fetching', data: undefined, error: null })).toBe('loading');
    expect(renderState(pendingIdle)).toBe('loading');
  });

  it('a failed call is "error" whatever the data says', () => {
    expect(renderState({ status: 'error', fetchStatus: 'idle', data: undefined, error: new Error('x') })).toBe('error');
    expect(renderState({ status: 'error', fetchStatus: 'idle', data: [], error: new Error('x') })).toBe('error');
  });

  it('an answer that is not a list is "error", not the all-clear', () => {
    expect(renderState({ status: 'success', fetchStatus: 'idle', data: { rows: [] }, error: null })).toBe('error');
    expect(renderState({ status: 'success', fetchStatus: 'idle', data: 'nope', error: null })).toBe('error');
    expect(renderState({ status: 'success', fetchStatus: 'idle', data: null, error: null })).toBe('error');
  });

  it('"empty" is reachable ONLY from a successful call that returned a list', () => {
    expect(renderState({ status: 'success', fetchStatus: 'idle', data: [], error: null })).toBe('empty');
    expect(renderState({ status: 'success', fetchStatus: 'fetching', data: [], error: null })).toBe('empty');
    expect(renderState({ status: 'pending', fetchStatus: 'paused', data: [], error: null })).not.toBe('empty');
  });

  it('a successful call with rows is "rows"', () => {
    expect(renderState({ status: 'success', fetchStatus: 'idle', data: [row({ item_id: 'a' })], error: null })).toBe('rows');
  });
});
