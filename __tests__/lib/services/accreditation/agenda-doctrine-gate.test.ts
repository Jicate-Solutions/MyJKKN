import { describe, it, expect } from 'vitest';
import {
  checkAgendaDoctrine,
  describeDoctrineHits,
} from '@/lib/services/accreditation/agenda-doctrine-gate';

// ---------------------------------------------------------------------------
// The Director's forbidden-agenda doctrine, as a test.
//
// "A number readable from the platform is FORBIDDEN on a meeting agenda."
// The agenda carries blockers, decisions, and carried items. The figures belong
// in the pre-meeting brief. The prompt asks for this; THIS gate guarantees it.
// ---------------------------------------------------------------------------

describe('checkAgendaDoctrine — a compliant agenda', () => {
  it('passes an agenda made only of blockers, decisions and carried items', () => {
    const agenda = [
      '1. Hostel block C fire-safety certificate is still not issued — decide who escalates.',
      '2. Carried: appoint a learning-lab Senior Learner for the pharmacology practical.',
      '3. Decision needed: whether the mess vendor contract is renewed or re-tendered.',
    ].join('\n');
    const res = checkAgendaDoctrine(agenda);
    expect(res.ok).toBe(true);
    expect(res.hits).toEqual([]);
  });

  it('allows the agenda\'s own item numbering, including roman and letter markers', () => {
    const agenda = ['1) First blocker.', 'iv. Fourth blocker.', 'c) Third blocker.'].join('\n');
    expect(checkAgendaDoctrine(agenda).ok).toBe(true);
  });

  it('allows a due date, which is an instruction rather than a readout', () => {
    const agenda = [
      '1. Carried: publish the learning framework revision — target 2026-08-15.',
      '2. Carried: submit the audit response by 15 August 2026.',
      '3. Carried: vendor reply due 15/08/2026.',
    ].join('\n');
    expect(checkAgendaDoctrine(agenda).ok).toBe(true);
  });

  it('allows a bare year and a sitting reference (labels, not measurements)', () => {
    const agenda = [
      '1. Carry forward the item deferred at meeting #4.',
      '2. Decide the 2026-27 review calendar.',
      '3. Ratify what the 3rd sitting left open.',
    ].join('\n');
    expect(checkAgendaDoctrine(agenda).ok).toBe(true);
  });

  it('allows the word form of a strike count while the digit form is forbidden', () => {
    expect(checkAgendaDoctrine('1. Carried twice already — decide whether to drop it.').ok).toBe(
      true,
    );
    expect(checkAgendaDoctrine('1. Carried 2 times already — decide whether to drop it.').ok).toBe(
      false,
    );
  });
});

describe('checkAgendaDoctrine — refuses platform-readable figures', () => {
  it('flags a bare count', () => {
    const res = checkAgendaDoctrine('1. Review the 12 open resolutions.');
    expect(res.ok).toBe(false);
    expect(res.hits[0]).toMatchObject({ token: '12', reason: 'figure', lineNo: 1 });
  });

  it('flags a decimal score', () => {
    const res = checkAgendaDoctrine('1. Note that the average understanding score is 3.8.');
    expect(res.ok).toBe(false);
    // A dotted decimal reads as a code-shaped figure; either classification is a
    // refusal, which is what the doctrine requires.
    expect(res.hits.map((h) => h.token)).toContain('3.8');
  });

  it('flags a percentage', () => {
    const res = checkAgendaDoctrine('1. Attendance stood at 84% this term.');
    expect(res.ok).toBe(false);
    expect(res.hits.some((h) => h.reason === 'percentage')).toBe(true);
  });

  it('flags a ratio written as "n of m"', () => {
    const res = checkAgendaDoctrine('1. Present the 18 of 24 completed evidence uploads.');
    expect(res.ok).toBe(false);
    expect(res.hits.some((h) => h.reason === 'percentage')).toBe(true);
  });

  it('flags a metric code', () => {
    const res = checkAgendaDoctrine('1. Present the 7.3.e closure rate to the committee.');
    expect(res.ok).toBe(false);
    expect(res.hits.some((h) => h.reason === 'metric_code' && h.token === '7.3.e')).toBe(true);
  });

  it('reports the line so the convener can see exactly where the figure is', () => {
    const res = checkAgendaDoctrine(
      ['1. A clean blocker line.', '2. Review the 12 open items.'].join('\n'),
    );
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].lineNo).toBe(2);
    expect(res.hits[0].line).toBe('2. Review the 12 open items.');
  });

  it('still catches a figure that shares a line with an allowed phrase', () => {
    // The year is excused; the count on the same line is not.
    const res = checkAgendaDoctrine('1. In 2026 we closed 9 resolutions — note it.');
    expect(res.ok).toBe(false);
    expect(res.hits.map((h) => h.token)).toContain('9');
  });

  it('does not excuse a large count just because it has four digits', () => {
    const res = checkAgendaDoctrine('1. Report on the 4200 learners enrolled.');
    expect(res.ok).toBe(false);
    expect(res.hits.map((h) => h.token)).toContain('4200');
  });
});

describe('checkAgendaDoctrine — edge cases', () => {
  it('treats empty and whitespace-only input as compliant', () => {
    expect(checkAgendaDoctrine('').ok).toBe(true);
    expect(checkAgendaDoctrine('   \n  ').ok).toBe(true);
  });

  it('tolerates a null/undefined body without throwing', () => {
    expect(checkAgendaDoctrine(undefined as unknown as string).ok).toBe(true);
  });
});

describe('describeDoctrineHits', () => {
  it('is empty when nothing was found', () => {
    expect(describeDoctrineHits([])).toBe('');
  });

  it('names the offending tokens and tells the convener where they belong', () => {
    const { hits } = checkAgendaDoctrine('1. Review the 12 open resolutions.');
    const msg = describeDoctrineHits(hits);
    expect(msg).toContain('"12"');
    expect(msg).toContain('line 1');
    expect(msg).toContain('brief');
  });

  it('summarises rather than dumping when there are many hits', () => {
    const { hits } = checkAgendaDoctrine('1. Counts 11 22 33 44 55 66 to review.');
    const msg = describeDoctrineHits(hits);
    expect(msg).toContain('more');
  });
});
