// ============================================================================
// Guard: the morning page must not report certainty it does not have.
// Created: 2026-08-14.
//
// THE RULE BEING PROTECTED. A campus-scanning page that reports "100%
// verified" is worth LESS than one reporting "94% could be photo-verified, 6%
// could not" — because only the second one can be trusted. Three ways that
// honesty gets lost in a refactor, each asserted below:
//
//   1. an empty denominator rendered as 0% or 100% instead of "no number";
//   2. an empty-string photo field counted as a photo;
//   3. the cluster average published alone, hiding that one college sits at
//      26% while another sits at 93%.
//
// Plus the ranking rule: a page capped at a dozen lines must put the item a
// human loses most by ignoring at the top, and must SAY how many it withheld
// rather than quietly shortening itself.
//
// WHY PURE-FUNCTION TESTED. vitest here defaults to `environment: 'node'`
// (vitest.config.js). All of the logic above lives in
// lib/services/id-cards/morning-page-service.ts precisely so it can be
// asserted with no DOM and no Supabase stub.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  EXCEPTION_LINE_CAP,
  UNRECORDED_EXCEPTION_CLASSES,
  collegesWithPeople,
  coverageSpread,
  formatLateness,
  formatPercent,
  hoursBetween,
  measure,
  measureCluster,
  measureCollege,
  measureVerifiableScans,
  mapWithConcurrency,
  rankExceptions,
  readMorningExceptions,
  readWhoIsOutNow,
  sortCoverageWorstFirst,
  unreadableColleges,
  weighExceptionKind,
  weighOverdue,
  withReadTimeout,
  type CoverageRow,
  type MorningException,
} from '@/lib/services/id-cards/morning-page-service';

// Real production shape, read 2026-08-14: the cluster average is respectable
// and two of these colleges are effectively blind.
const college = (
  name: string,
  lp: number,
  lt: number,
  tp: number,
  tt: number,
  readFailed = false
): CoverageRow => ({
  institutionId: name.toLowerCase().replace(/\W+/g, '-'),
  institutionName: name,
  learnersWithPhoto: lp,
  learnersTotal: lt,
  teamWithPhoto: tp,
  teamTotal: tt,
  readFailed,
});

const ESTATE: CoverageRow[] = [
  college('Nattraja Vidhyalya CBSE', 210, 226, 25, 44),
  college('Allied Health Sciences', 203, 240, 18, 29),
  college('Engineering and Technology', 205, 787, 63, 108),
  college('Matric Higher Secondary School', 0, 552, 0, 55),
  college('Nobody Here', 0, 0, 0, 0),
];

const exception = (over: Partial<MorningException>): MorningException => ({
  id: 'x',
  kind: 'card_print_failed',
  headline: 'h',
  detail: 'd',
  occurredAt: null,
  weight: 1,
  ...over,
});

describe('measure — an empty denominator has no honest percentage', () => {
  it('returns null rather than 0 or 100 when nobody is counted', () => {
    expect(measure(0, 0).percent).toBeNull();
  });

  it('renders that null as a dash, never as a number', () => {
    expect(formatPercent(measure(0, 0).percent)).toBe('—');
  });

  it('still reports a real zero as zero — "none of 500" is a fact, not a gap', () => {
    const none = measure(0, 500);
    expect(none.percent).toBe(0);
    expect(formatPercent(none.percent)).toBe('0.0%');
  });

  it('distinguishes "nothing to measure" from "measured and none" in the rendered string', () => {
    expect(formatPercent(measure(0, 0).percent)).not.toBe(formatPercent(measure(0, 500).percent));
  });
});

describe('measureVerifiableScans — the QR is not the control, the photo is', () => {
  it('counts only scans where a face could have been compared', () => {
    const m = measureVerifiableScans([
      { hadPhotoOnFile: true },
      { hadPhotoOnFile: true },
      { hadPhotoOnFile: false },
      { hadPhotoOnFile: false },
    ]);
    expect(m.withPhoto).toBe(2);
    expect(m.total).toBe(4);
    expect(m.percent).toBe(50);
  });

  it('reports no percentage at all when no scan happened — a quiet night is not 100% verified', () => {
    expect(measureVerifiableScans([]).percent).toBeNull();
  });
});

describe('coverage — the cluster average must never stand alone', () => {
  it('drops colleges with nobody on their books instead of scoring them 0%', () => {
    expect(collegesWithPeople(ESTATE).map((c) => c.institutionName)).not.toContain('Nobody Here');
  });

  it('puts the college that most needs photographs first', () => {
    const ordered = sortCoverageWorstFirst(ESTATE);
    expect(ordered[0].institutionName).toBe('Matric Higher Secondary School');
    expect(ordered[ordered.length - 1].institutionName).toBe('Nattraja Vidhyalya CBSE');
  });

  it('exposes the spread the average conceals', () => {
    const spread = coverageSpread(ESTATE);
    expect(spread).not.toBeNull();
    expect(spread!.worst.institutionName).toBe('Matric Higher Secondary School');
    expect(spread!.best.institutionName).toBe('Nattraja Vidhyalya CBSE');
    expect(spread!.pointsApart).toBeGreaterThan(80);
  });

  it('proves the average is misleading on the real estate: cluster is far above its worst college', () => {
    const cluster = measureCluster(ESTATE);
    const worst = measureCollege(coverageSpread(ESTATE)!.worst);
    expect(cluster.percent).not.toBeNull();
    expect(worst.percent).toBe(0);
    expect(cluster.percent!).toBeGreaterThan(25);
  });

  it('counts learners and team members together for a college', () => {
    const m = measureCollege(college('X', 3, 10, 2, 10));
    expect(m.withPhoto).toBe(5);
    expect(m.total).toBe(20);
    expect(m.percent).toBe(25);
  });

  it('has no spread to report when only one college has people', () => {
    expect(coverageSpread([college('Only', 1, 2, 0, 0), college('Empty', 0, 0, 0, 0)])).toBeNull();
  });
});

describe('rankExceptions — a dozen lines, worst first, nothing hidden silently', () => {
  it('orders by weight, highest first', () => {
    const { shown } = rankExceptions([
      exception({ id: 'low', weight: 10 }),
      exception({ id: 'high', weight: 200 }),
      exception({ id: 'mid', weight: 100 }),
    ]);
    expect(shown.map((e) => e.id)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks weight ties on recency', () => {
    const { shown } = rankExceptions([
      exception({ id: 'older', weight: 50, occurredAt: '2026-08-13T06:00:00Z' }),
      exception({ id: 'newer', weight: 50, occurredAt: '2026-08-14T06:00:00Z' }),
    ]);
    expect(shown.map((e) => e.id)).toEqual(['newer', 'older']);
  });

  it('caps the list and REPORTS the remainder rather than truncating quietly', () => {
    const many = Array.from({ length: 30 }, (_, i) => exception({ id: `e${i}`, weight: i }));
    const { shown, hiddenCount } = rankExceptions(many);
    expect(shown).toHaveLength(EXCEPTION_LINE_CAP);
    expect(hiddenCount).toBe(30 - EXCEPTION_LINE_CAP);
    expect(shown.length + hiddenCount).toBe(many.length);
  });

  it('reports no remainder when everything fits', () => {
    const { shown, hiddenCount } = rankExceptions([exception({ id: 'a' })]);
    expect(shown).toHaveLength(1);
    expect(hiddenCount).toBe(0);
  });

  it('is stable — the same input renders in the same order twice', () => {
    const rows = [exception({ id: 'b', weight: 5 }), exception({ id: 'a', weight: 5 })];
    expect(rankExceptions(rows).shown.map((e) => e.id)).toEqual(
      rankExceptions(rows).shown.map((e) => e.id)
    );
  });
});

describe('urgency — a person unaccounted for outranks a card that would not print', () => {
  it('ranks an overdue return above every other class', () => {
    expect(weighExceptionKind('gate_pass_overdue')).toBeGreaterThan(
      weighExceptionKind('pass_holder_has_left')
    );
    expect(weighExceptionKind('pass_holder_has_left')).toBeGreaterThan(
      weighExceptionKind('meal_scanned_for_someone_who_left')
    );
    expect(weighExceptionKind('scans_without_a_photo_to_check')).toBeGreaterThan(
      weighExceptionKind('card_print_failed')
    );
  });

  it('escalates the longer somebody is late', () => {
    expect(weighOverdue(6)).toBeGreaterThan(weighOverdue(2));
  });

  it('caps the escalation so one ancient pass cannot own the page forever', () => {
    expect(weighOverdue(10_000)).toBe(weighOverdue(48));
  });

  it('never lets a not-yet-late pass score above an on-time one', () => {
    expect(weighOverdue(-5)).toBe(weighOverdue(0));
  });
});

describe('time and phrasing', () => {
  it('measures lateness in hours between two instants', () => {
    expect(hoursBetween('2026-08-14T06:00:00Z', '2026-08-14T09:00:00Z')).toBe(3);
  });

  it('is negative before the due time, so the grace check cannot misfire', () => {
    expect(hoursBetween('2026-08-14T09:00:00Z', '2026-08-14T06:00:00Z')).toBe(-3);
  });

  it('says hours under a day and days beyond it', () => {
    expect(formatLateness(1)).toBe('1 hour late');
    expect(formatLateness(5.9)).toBe('5 hours late');
    expect(formatLateness(26)).toBe('1 day late');
    expect(formatLateness(50)).toBe('2 days late');
  });

  it('never renders a red badge reading "0 hours late" for somebody who IS late', () => {
    // Flooring 0.5 to 0 produced a badge that contradicted itself on a page
    // whose whole claim is precision.
    expect(formatLateness(0.5)).toBe('under an hour late');
    expect(formatLateness(0.99)).toBe('under an hour late');
    expect(formatLateness(0)).not.toContain('0 hour');
  });
});

describe('a count that failed to read is not a count of zero', () => {
  // The failure this guards, in its most dangerous shape: the TOTAL counts read
  // fine and only the with-photo counts failed. Coerced to 0 that renders a real
  // college of 540 people at 0% — a false catastrophe that sorts to the top of
  // the page and drags the cluster figure down with it.
  const DARK = college('Unreadable College', 0, 500, 0, 40, true);
  // The other half of the same failure: the TOTAL counts are what failed, so
  // every number is 0 and a naive "has people?" filter drops the college from
  // the table entirely — a read failure rendered as an absence nobody notices.
  const DARK_TOTALS = college('Vanished College', 0, 0, 0, 0, true);
  const WITH_DARK: CoverageRow[] = [...ESTATE, DARK, DARK_TOTALS];

  it('measures an unreadable college as unknown, not as 0%', () => {
    expect(measureCollege(DARK).percent).toBeNull();
    expect(formatPercent(measureCollege(DARK).percent)).toBe('—');
  });

  it('keeps an all-zero unreadable college in the table — dropping it would turn a read failure into an absence', () => {
    const names = collegesWithPeople(WITH_DARK).map((c) => c.institutionName);
    expect(names).toContain('Vanished College');
    expect(names).toContain('Unreadable College');
    // …while a genuinely empty college that READ fine is still dropped.
    expect(names).not.toContain('Nobody Here');
  });

  it('names them, so somebody can go and fix the read', () => {
    expect(unreadableColleges(WITH_DARK).map((c) => c.institutionName)).toEqual([
      'Unreadable College',
      'Vanished College',
    ]);
    expect(unreadableColleges(ESTATE)).toHaveLength(0);
  });

  it('excludes it from the cluster figure instead of dragging it down as a false zero', () => {
    expect(measureCluster(WITH_DARK)).toEqual(measureCluster(ESTATE));
  });

  it('excludes it from the spread — an unknown is not a low score', () => {
    expect(coverageSpread(WITH_DARK)!.worst.institutionName).toBe(
      coverageSpread(ESTATE)!.worst.institutionName
    );
  });

  it('sorts them LAST, so a read problem never buries the real worst college', () => {
    const ordered = sortCoverageWorstFirst(WITH_DARK).map((c) => c.institutionName);
    expect(ordered.slice(-2)).toEqual(['Unreadable College', 'Vanished College']);
    expect(ordered[0]).toBe('Matric Higher Secondary School');
  });
});

describe('withReadTimeout — the page must never spin forever', () => {
  it('passes a successful read straight through', async () => {
    const result = await withReadTimeout(Promise.resolve({ ok: true as const, data: 42 }), 'X', 50);
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('turns a read that never answers into a stated failure, not an endless wait', async () => {
    const never = new Promise<never>(() => {});
    const result = await withReadTimeout(never, 'The coverage read', 10);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('The coverage read');
    expect(result.ok === false && result.message).toContain('did not answer');
  });

  it('turns a thrown read into a stated failure rather than an unhandled rejection', async () => {
    const result = await withReadTimeout(Promise.reject(new Error('socket closed')), 'X', 50);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('socket closed');
  });

  it('reports a failure the read itself declared, unchanged', async () => {
    const declared = Promise.resolve({ ok: false as const, message: 'permission denied' });
    expect(await withReadTimeout(declared, 'X', 50)).toEqual({
      ok: false,
      message: 'permission denied',
    });
  });
});

// ── A chainable Supabase stand-in, one canned answer per table ──────────────
// Small on purpose: readMorningExceptions is the one impure function whose
// FAILURE modes are the point, and they cannot be reached from the pure half.
type Canned = { data?: unknown[]; error?: { message: string } | null };

function fakeClient(byTable: Record<string, Canned>) {
  const from = (table: string) => {
    const canned = byTable[table] ?? { data: [] };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'is', 'gte', 'eq', 'order', 'limit', 'not', 'neq']) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        resolve({ data: canned.error ? null : canned.data ?? [], error: canned.error ?? null })
      );
    return chain;
  };
  return { from } as never;
}

const MEAL = (id: string, learnerId: string) => ({
  id,
  learner_id: learnerId,
  meal_type: 'lunch',
  scan_time: new Date().toISOString(),
});

describe('a helper read that fails must not fabricate an honest-looking answer', () => {
  it('reports the learner source as unreadable instead of scoring every scan 0%', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        hostel_gate_passes: { data: [] },
        mess_meal_records: { data: [MEAL('m1', 'p1'), MEAL('m2', 'p2')] },
        profiles: {
          data: [
            { id: 'p1', full_name: 'A', learner_id: 'l1', email: null },
            { id: 'p2', full_name: 'B', learner_id: 'l2', email: null },
          ],
        },
        learners_profiles: { error: { message: 'permission denied for table learners_profiles' } },
        'staff': { data: [] },
        id_card_print_jobs: { data: [] },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // An empty learner lookup would otherwise read as "nobody has a photo".
    expect(result.data.scanVerifiability).toBeNull();
    expect(result.data.unreadableSources.join(' ')).toContain('Learner records');
    expect(result.data.exceptions.some((e) => e.kind === 'scans_without_a_photo_to_check')).toBe(
      false
    );
  });

  it('fails the whole read when the people cannot be named at all', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        hostel_gate_passes: { data: [] },
        mess_meal_records: { data: [MEAL('m1', 'p1')] },
        profiles: { error: { message: 'profiles unavailable' } },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('profiles unavailable');
  });

  it('still says the print source went dark rather than implying no card failed', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        hostel_gate_passes: { data: [] },
        mess_meal_records: { data: [] },
        profiles: { data: [] },
        learners_profiles: { data: [] },
        'staff': { data: [] },
        id_card_print_jobs: { error: { message: 'relation does not exist' } },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.unreadableSources.join(' ')).toContain('Card print jobs');
  });
});

const passRow = (n: number) => ({
  id: `gp${n}`,
  pass_number: `P${n}`,
  learner_id: `p${n}`,
  destination: 'Home',
  expected_return: new Date(Date.now() - 86_400_000).toISOString(),
  out_time: null,
  status: 'active',
});

describe('a capped read must say it was capped', () => {
  const pass = passRow;

  it('flags the open-pass read when it hits its cap — people outside must not vanish quietly', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        // 500 is the reader's cap; hitting it exactly means there may be more.
        hostel_gate_passes: { data: Array.from({ length: 500 }, (_, i) => pass(i)) },
        mess_meal_records: { data: [] },
        profiles: { data: [] },
        learners_profiles: { data: [] },
        'staff': { data: [] },
        id_card_print_jobs: { data: [] },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.passesTruncated).toBe(true);
  });

  it('flags the SAME cap in the who-is-out reader, so that table warns on its own', async () => {
    // Somebody reading only the roster must not see a list that was shortened
    // without saying so, even though the exceptions card carries its own flag.
    const result = await readWhoIsOutNow(
      fakeClient({
        hostel_gate_passes: { data: Array.from({ length: 500 }, (_, i) => passRow(i)) },
        profiles: { data: [] },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.truncated).toBe(true);
    expect(result.data.passes).toHaveLength(500);
  });

  it('does not cry truncation on an ordinary morning', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        hostel_gate_passes: { data: [pass(1), pass(2)] },
        mess_meal_records: { data: [] },
        profiles: { data: [] },
        learners_profiles: { data: [] },
        'staff': { data: [] },
        id_card_print_jobs: { data: [] },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.passesTruncated).toBe(false);
    expect(result.data.mealsTruncated).toBe(false);
  });
});

describe('a team member eating at the mess is not automatically unverifiable', () => {
  it('finds their picture on the team record, which carries no learner link', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        hostel_gate_passes: { data: [] },
        mess_meal_records: { data: [MEAL('m1', 'p-team')] },
        profiles: {
          data: [{ id: 'p-team', full_name: 'Team Person', learner_id: null, email: 'T@jkkn.ac.in' }],
        },
        learners_profiles: { data: [] },
        'staff': { data: [{ institution_email: 't@jkkn.ac.in', profile_picture: 'https://x/p.jpg' }] },
        id_card_print_jobs: { data: [] },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scanVerifiability).toEqual({ withPhoto: 1, total: 1, percent: 100 });
    expect(result.data.exceptions.some((e) => e.kind === 'scans_without_a_photo_to_check')).toBe(
      false
    );
  });

  it('still counts a team member with a BLANK picture as unverifiable', async () => {
    const result = await readMorningExceptions(
      fakeClient({
        hostel_gate_passes: { data: [] },
        mess_meal_records: { data: [MEAL('m1', 'p-team')] },
        profiles: {
          data: [{ id: 'p-team', full_name: 'Team Person', learner_id: null, email: 't@jkkn.ac.in' }],
        },
        learners_profiles: { data: [] },
        'staff': { data: [{ institution_email: 't@jkkn.ac.in', profile_picture: '' }] },
        id_card_print_jobs: { data: [] },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scanVerifiability).toEqual({ withPhoto: 0, total: 1, percent: 0 });
    expect(result.data.exceptions.some((e) => e.kind === 'scans_without_a_photo_to_check')).toBe(
      true
    );
  });
});

describe('mapWithConcurrency — the coverage read must not trip its own timeout', () => {
  it('never runs more than the ceiling at once', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // still concurrent, not serialised
  });

  it('returns results in input order, not completion order', async () => {
    const out = await mapWithConcurrency([30, 1, 20, 2], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 1, 20, 2]);
  });

  it('handles an empty list without hanging', async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([]);
  });
});

describe('the gaps are declared, not implied', () => {
  it('names every exception class nothing records, so none renders as a reassuring zero', () => {
    expect(UNRECORDED_EXCEPTION_CLASSES.length).toBeGreaterThan(0);
    for (const gap of UNRECORDED_EXCEPTION_CLASSES) {
      expect(gap.title.length).toBeGreaterThan(0);
      expect(gap.why.length).toBeGreaterThan(0);
    }
  });

  it('still declares the two kinds that exist today: refused scans and repeat scans', () => {
    const joined = UNRECORDED_EXCEPTION_CLASSES.map((g) => `${g.title} ${g.why}`).join(' ').toLowerCase();
    expect(joined).toContain('rejected');
    expect(joined).toContain('twice');
  });
});
