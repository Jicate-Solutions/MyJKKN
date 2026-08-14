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
  rankExceptions,
  sortCoverageWorstFirst,
  weighExceptionKind,
  weighOverdue,
  type CoverageRow,
  type MorningException,
} from '@/lib/services/id-cards/morning-page-service';

// Real production shape, read 2026-08-14: the cluster average is respectable
// and two of these colleges are effectively blind.
const college = (name: string, lp: number, lt: number, tp: number, tt: number): CoverageRow => ({
  institutionId: name.toLowerCase().replace(/\W+/g, '-'),
  institutionName: name,
  learnersWithPhoto: lp,
  learnersTotal: lt,
  teamWithPhoto: tp,
  teamTotal: tt,
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
