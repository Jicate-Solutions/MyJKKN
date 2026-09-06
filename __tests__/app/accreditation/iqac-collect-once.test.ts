import { describe, it, expect } from 'vitest';
import {
  sourceLabel,
  groupEvidenceBySource,
  summariseCollectOnce,
  academicYearLabel,
  reportingWindows,
  isInspectedByAccreditationBodies,
  describeApplicability,
} from '@/app/(routes)/accreditation/iqac/_lib/collect-once';

// ---------------------------------------------------------------------------
// Fixtures mirror the live shape read from prod on 2026-08-02:
// 212 mapping rows over 11 source tables, of which exactly ONE
// (obe_course_attainment_rollup, 46 records) is claimed by two bodies.
// The counts arrive from PostgREST as strings often enough that trusting the
// declared bigint is how a total silently becomes concatenation.
// ---------------------------------------------------------------------------

const ATTAINMENT_NAAC = {
  source_table: 'obe_course_attainment_rollup',
  body_code: 'NAAC',
  rows: 46,
  distinct_sources: 46,
};
const ATTAINMENT_NBA = {
  source_table: 'obe_course_attainment_rollup',
  body_code: 'NBA',
  rows: 46,
  distinct_sources: 46,
};
const STAFF_NAAC = {
  source_table: 'hr_naac_evidence',
  body_code: 'NAAC',
  rows: 43,
  distinct_sources: 11,
};

describe('sourceLabel', () => {
  it('names a known source in words a coordinator would use', () => {
    expect(sourceLabel('obe_course_attainment_rollup')).toBe('Course attainment records');
    expect(sourceLabel('sh_publications')).toBe('Research papers');
  });

  it('never leaks a raw table name for a source nobody has labelled yet', () => {
    // A snake_case identifier on a governance screen reads as a schema leak.
    expect(sourceLabel('some_new_table')).toBe('Some new table');
    expect(sourceLabel('some_new_table')).not.toContain('_');
  });

  it('drops a body suffix from a source whose name claims one body', () => {
    // The page's argument is that a source serves several bodies; a label
    // reading "Placement naac evidence" contradicts it in passing.
    expect(sourceLabel('placement_naac_evidence')).toBe('Placement');
  });
});

describe('groupEvidenceBySource', () => {
  it('shows a twice-claimed source ONCE with each body counted beneath', () => {
    // Director decision 1. This is the single case that exists in production
    // today, and the whole page is built to make it legible.
    const [first] = groupEvidenceBySource([ATTAINMENT_NAAC, ATTAINMENT_NBA]);
    expect(first.label).toBe('Course attainment records');
    expect(first.servesMultipleBodies).toBe(true);
    expect(first.claims.map((c) => c.bodyCode)).toEqual(['NAAC', 'NBA']);
    expect(first.sentence).toBe('46 held once, serving 2 bodies — NAAC counts 46 · NBA counts 46.');
  });

  it('does NOT add the two bodies together', () => {
    // 46 records claimed twice are 46 records. Summing is the exact
    // double-count this page exists to end, and 92 is the wrong answer.
    const [first] = groupEvidenceBySource([ATTAINMENT_NAAC, ATTAINMENT_NBA]);
    expect(first.heldOnce).toBe(46);
    expect(first.heldOnce).not.toBe(92);
    expect(first.sentence).not.toContain('92');
  });

  it('collapses one body claiming the same source for two of its metrics', () => {
    const [first] = groupEvidenceBySource([
      { source_table: 'events', body_code: 'NAAC', rows: 6, distinct_sources: 5 },
      { source_table: 'events', body_code: 'NAAC', rows: 4, distinct_sources: 3 },
    ]);
    expect(first.claims).toHaveLength(1);
    expect(first.heldOnce).toBe(5);
    expect(first.servesMultipleBodies).toBe(false);
  });

  it('puts multi-body sources first because they are the working proof', () => {
    const out = groupEvidenceBySource([STAFF_NAAC, ATTAINMENT_NAAC, ATTAINMENT_NBA]);
    expect(out[0].sourceTable).toBe('obe_course_attainment_rollup');
  });

  it('survives counts arriving as strings', () => {
    const [first] = groupEvidenceBySource([
      { ...ATTAINMENT_NAAC, distinct_sources: '46' },
      { ...ATTAINMENT_NBA, distinct_sources: '46' },
    ]);
    expect(first.heldOnce).toBe(46);
    expect(first.sentence).not.toContain('4646');
  });

  it('ignores a row with no source or no body rather than grouping under undefined', () => {
    const out = groupEvidenceBySource([
      ATTAINMENT_NAAC,
      { source_table: '', body_code: 'NAAC', rows: 1, distinct_sources: 1 },
      { source_table: 'x', body_code: '', rows: 1, distinct_sources: 1 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('summariseCollectOnce', () => {
  it('counts what a per-body regime would have re-collected', () => {
    const s = summariseCollectOnce([ATTAINMENT_NAAC, ATTAINMENT_NBA, STAFF_NAAC]);
    expect(s.sourcesHeld).toBe(2);
    expect(s.sourcesServingMultipleBodies).toBe(1);
    // 46 records would have been entered a second time for NBA.
    expect(s.entriesSavedByCollectingOnce).toBe(46);
  });

  it('emits no grade, total or ranking', () => {
    const s = summariseCollectOnce([ATTAINMENT_NAAC]);
    const keys = Object.keys(s);
    expect(keys).not.toContain('score');
    expect(keys).not.toContain('grade');
    expect(keys).not.toContain('rank');
    expect(keys).not.toContain('percentage');
  });
});

describe('academicYearLabel', () => {
  it('matches the label already in the database', () => {
    // 210 of 212 live rows read "AY 2026-27"; two stray "2026-27" rows were
    // normalised on 2026-08-02.
    expect(academicYearLabel(new Date('2026-08-02T00:00:00'))).toBe('AY 2026-27');
  });

  it('files spring under the session that opened the previous June', () => {
    // The JKKN year opens in June. Using the calendar year would file every
    // January-to-May record under the wrong session.
    expect(academicYearLabel(new Date('2027-03-15T00:00:00'))).toBe('AY 2026-27');
    expect(academicYearLabel(new Date('2026-05-31T00:00:00'))).toBe('AY 2025-26');
    expect(academicYearLabel(new Date('2026-06-01T00:00:00'))).toBe('AY 2026-27');
  });

  it('pads a single-digit end year', () => {
    expect(academicYearLabel(new Date('2009-07-01T00:00:00'))).toBe('AY 2009-10');
    expect(academicYearLabel(new Date('2099-07-01T00:00:00'))).toBe('AY 2099-00');
  });
});

describe('reportingWindows', () => {
  it('defaults to the current academic year', () => {
    const { defaultWindow } = reportingWindows(
      ['AY 2025-26', 'AY 2024-25'],
      new Date('2026-08-02T00:00:00'),
    );
    expect(defaultWindow).toBe('AY 2026-27');
  });

  it('offers the current year even when nothing has been filed against it', () => {
    // Omitting an empty current year makes the page open on last year's numbers
    // in July and look complete — the quietest way to under-report a live session.
    const { windows } = reportingWindows(
      ['AY 2025-26'],
      new Date('2026-07-10T00:00:00'),
    );
    expect(windows).toContain('AY 2026-27');
    expect(windows[0]).toBe('AY 2026-27');
  });

  it('does not duplicate the current year when data already has it', () => {
    const { windows } = reportingWindows(
      ['AY 2026-27', 'AY 2026-27', 'AY 2025-26'],
      new Date('2026-08-02T00:00:00'),
    );
    expect(windows.filter((w) => w === 'AY 2026-27')).toHaveLength(1);
  });
});

describe('applicability', () => {
  const PHARMACY = { id: 'i1', name: 'JKKN College of Pharmacy', iqac_code: 'PHAR' };
  const SCHOOL = { id: 'i2', name: 'Nattraja Vidhyalya CBSE', iqac_code: null };
  const OFFICE = { id: 'i3', name: 'JKKN Main Office', iqac_code: '  ' };

  it('treats the eight coded institutions as inspected', () => {
    expect(isInspectedByAccreditationBodies(PHARMACY)).toBe(true);
  });

  it('says "does not apply" for a school rather than showing a zero', () => {
    // Director decision 3. A school showing 0 of 107 answered reads as failing
    // an inspection it was never subject to — a different claim entirely.
    expect(isInspectedByAccreditationBodies(SCHOOL)).toBe(false);
    expect(describeApplicability(SCHOOL)).toBe(
      'Does not apply — no awarding body inspects this institution.',
    );
    expect(describeApplicability(SCHOOL)).not.toMatch(/\b0\b/);
  });

  it('treats a blank code as absent, not as a code', () => {
    expect(isInspectedByAccreditationBodies(OFFICE)).toBe(false);
  });
});
