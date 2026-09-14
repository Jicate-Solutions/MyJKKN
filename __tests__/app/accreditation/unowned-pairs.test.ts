/**
 * Which (campus × awarding body) pairs have nobody accountable.
 *
 * The defect this closes is an INVISIBLE ABSENCE, so the assertions that matter
 * are the ones about what is NOT there: a campus with no owner for any body, a
 * declined assignment that must not read as ownership, and a campus whose
 * mapping was never recorded — which is unknown, not empty, and must contribute
 * neither a gap nor a denominator.
 *
 * The fixture mirrors production's SHAPE (35 declared pairs, 14 body-level
 * owners, 21 gaps, three colleges with nothing) but is built here rather than
 * read live: production drifts, and a hardcoded live number is not a fixture.
 */

import { describe, it, expect } from 'vitest';
import {
  describeOwnershipGaps,
  gapHeadline,
  type BodyOwnerRow,
  type DeclaredBodyRow,
  type NamedInstitution,
} from '@/app/(routes)/accreditation/manage/owners/_lib/unowned-pairs';

// ----------------------------------------------------------------------------
// A fixture shaped like production on 2026-09-07.
// ----------------------------------------------------------------------------

/** The ten mapped campuses, plus two carrying no mapping at all. */
const INSTITUTIONS: NamedInstitution[] = [
  { id: 'ahs', name: 'JKKN College of Allied Health Sciences' },
  { id: 'aided', name: 'JKKN College of Arts and Science (Aided)' },
  { id: 'self', name: 'JKKN College of Arts and Science (Self)' },
  { id: 'edu', name: 'JKKN College of Education' },
  { id: 'engg', name: 'JKKN College of Engineering and Technology' },
  { id: 'nursing', name: 'JKKN College of Nursing and Research' },
  { id: 'pharm', name: 'JKKN College of Pharmacy' },
  { id: 'dental', name: 'JKKN Dental College and Hospital' },
  { id: 'matric', name: 'JKKN Matric Higher Secondary School' },
  { id: 'cbse', name: 'Nattraja Vidhyalya CBSE' },
  // No mapping rows — offices and companies. Unknown, not "answers to nobody".
  { id: 'office', name: 'JKKN Main Office' },
  { id: 'jicate', name: 'Jicate Solutions' },
];

/** The declared matrix: 35 active pairs across ten campuses. */
const DECLARED: DeclaredBodyRow[] = [
  ...['NAAC', 'NCAHP', 'NIRF', 'QS'].map((b) => row('ahs', b)),
  ...['NAAC', 'NIRF', 'QS', 'THE'].map((b) => row('aided', b)),
  ...['NAAC', 'NIRF', 'QS', 'THE'].map((b) => row('self', b)),
  ...['NAAC', 'NCTE', 'NIRF', 'QS'].map((b) => row('edu', b)),
  ...['ABET', 'AICTE', 'NAAC', 'NBA', 'NIRF'].map((b) => row('engg', b)),
  ...['INC', 'NAAC', 'NIRF', 'QS'].map((b) => row('nursing', b)),
  ...['NAAC', 'NIRF', 'PCI', 'QS'].map((b) => row('pharm', b)),
  ...['DCI', 'NAAC', 'NIRF', 'QS'].map((b) => row('dental', b)),
  row('matric', 'MATRIC'),
  row('cbse', 'CBSE'),
];

function row(institution_id: string, body_code: string): DeclaredBodyRow {
  return { institution_id, body_code, is_active: true };
}

/** A live (pending) body-level owner for one pair. */
function owner(institution_id: string, body_code: string): BodyOwnerRow {
  return {
    institution_id,
    body_code,
    metric_code: null,
    programme_id: null,
    assignment_status: 'pending',
  };
}

/** The 14 body-level owner rows production carries, all pending. */
const OWNERS: BodyOwnerRow[] = [
  owner('self', 'NAAC'),
  owner('self', 'NIRF'),
  owner('engg', 'NAAC'),
  owner('engg', 'NIRF'),
  owner('engg', 'NBA'),
  owner('engg', 'AICTE'),
  owner('nursing', 'NAAC'),
  owner('nursing', 'INC'),
  owner('pharm', 'NIRF'),
  owner('pharm', 'PCI'),
  owner('pharm', 'QS'),
  owner('dental', 'NAAC'),
  owner('dental', 'NIRF'),
  owner('dental', 'DCI'),
];

// ----------------------------------------------------------------------------

describe('describeOwnershipGaps — the production shape', () => {
  const report = describeOwnershipGaps(INSTITUTIONS, DECLARED, OWNERS);

  it('counts the declared matrix, not the institutions table', () => {
    // Twelve campuses are readable; only the ten with a mapping row declare
    // anything, and they declare 35 pairs between them.
    expect(report.declaredPairs).toBe(35);
    expect(report.ownedPairs).toBe(14);
    expect(report.unowned).toHaveLength(21);
  });

  it('names the three colleges where no declared body has an owner', () => {
    // The fact a one-campus-at-a-time desk can never state. Matric and CBSE are
    // also fully unowned and appear here too — they are schools, not colleges,
    // and the list makes no distinction because the mapping table does not.
    expect(report.campusesWithNobody.map((c) => c.institutionName)).toEqual([
      'JKKN College of Allied Health Sciences',
      'JKKN College of Arts and Science (Aided)',
      'JKKN College of Education',
      'JKKN Matric Higher Secondary School',
      'Nattraja Vidhyalya CBSE',
    ]);
  });

  it('marks a fully-unowned campus and does not mark a partly-owned one', () => {
    const ahs = report.campuses.find((c) => c.institutionId === 'ahs');
    expect(ahs?.nobodyAtAll).toBe(true);
    expect(ahs?.declared).toBe(4);
    expect(ahs?.unowned).toHaveLength(4);

    const engg = report.campuses.find((c) => c.institutionId === 'engg');
    expect(engg?.nobodyAtAll).toBe(false);
    // Four of five bodies are owned; ABET is the one nobody holds.
    expect(engg?.unowned.map((p) => p.bodyCode)).toEqual(['ABET']);
  });

  it('leaves a fully-owned campus out of the per-campus list entirely', () => {
    const owned = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC'), row('engg', 'NBA')],
      [owner('engg', 'NAAC'), owner('engg', 'NBA')],
    );
    expect(owned.declaredPairs).toBe(2);
    expect(owned.ownedPairs).toBe(2);
    expect(owned.campuses).toEqual([]);
    expect(owned.unowned).toEqual([]);
  });

  it('ranks the bodies by how many campuses have nobody for them', () => {
    // QS is declared by seven campuses and owned by one, so it leads.
    expect(report.byBody[0]).toEqual({ bodyCode: 'QS', count: 6 });
    const naac = report.byBody.find((b) => b.bodyCode === 'NAAC');
    expect(naac?.count).toBe(4);
  });

  it('sorts campuses by name and bodies by code, so the list is stable', () => {
    expect(report.campuses.map((c) => c.institutionId)).toEqual([
      'ahs',
      'aided',
      'self',
      'edu',
      'engg',
      'nursing',
      'pharm',
      'dental',
      'matric',
      'cbse',
    ]);
    const aided = report.campuses.find((c) => c.institutionId === 'aided');
    expect(aided?.unowned.map((p) => p.bodyCode)).toEqual([
      'NAAC',
      'NIRF',
      'QS',
      'THE',
    ]);
  });
});

describe('a campus with no mapping is unknown, never empty', () => {
  const report = describeOwnershipGaps(INSTITUTIONS, DECLARED, OWNERS);

  it('contributes no gap and no denominator', () => {
    expect(report.campuses.some((c) => c.institutionId === 'office')).toBe(false);
    expect(report.unowned.some((p) => p.institutionId === 'jicate')).toBe(false);
  });

  it('is named separately so the screen can admit the matrix is short', () => {
    expect(report.unmappedInstitutions.map((i) => i.id)).toEqual([
      'office',
      'jicate',
    ]);
  });

  it('reports nothing at all when no campus has a mapping', () => {
    const blank = describeOwnershipGaps(
      [{ id: 'office', name: 'JKKN Main Office' }],
      [],
      [],
    );
    expect(blank.declaredPairs).toBe(0);
    expect(blank.unowned).toEqual([]);
    expect(blank.unmappedInstitutions).toHaveLength(1);
  });
});

describe('a declined assignment is a gap, and says so', () => {
  const declined: BodyOwnerRow = {
    institution_id: 'engg',
    body_code: 'NBA',
    metric_code: null,
    programme_id: null,
    assignment_status: 'declined',
  };

  it('does not count as ownership', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NBA')],
      [declined],
    );
    expect(report.ownedPairs).toBe(0);
    expect(report.unowned).toHaveLength(1);
  });

  it('is told apart from a pair nobody was ever asked about', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NBA'), row('engg', 'ABET')],
      [declined],
    );
    const byBody = new Map(report.unowned.map((p) => [p.bodyCode, p.reason]));
    expect(byBody.get('NBA')).toBe('declined');
    expect(byBody.get('ABET')).toBe('never-assigned');
  });

  it('treats a confirmed assignment as ownership', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NBA')],
      [{ ...declined, assignment_status: 'confirmed' }],
    );
    expect(report.ownedPairs).toBe(1);
    expect(report.unowned).toEqual([]);
  });
});

describe('only the body-level slot answers "who is accountable for this body"', () => {
  it('ignores a metric-level owner row', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC')],
      [
        {
          institution_id: 'engg',
          body_code: 'NAAC',
          metric_code: '3.1.1',
          programme_id: null,
          assignment_status: 'confirmed',
        },
      ],
    );
    // Somebody owns one metric. Nobody owns NAAC.
    expect(report.unowned.map((p) => p.bodyCode)).toEqual(['NAAC']);
  });

  it('ignores a programme-scoped owner row', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NBA')],
      [
        {
          institution_id: 'engg',
          body_code: 'NBA',
          metric_code: null,
          programme_id: 'prog-1',
          assignment_status: 'confirmed',
        },
      ],
    );
    expect(report.unowned.map((p) => p.bodyCode)).toEqual(['NBA']);
  });
});

describe('the reader’s accessible set bounds every claim', () => {
  it('ignores declared rows for a campus not handed in', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC'), row('dental', 'DCI')],
      [],
    );
    expect(report.declaredPairs).toBe(1);
    expect(report.unowned.map((p) => p.institutionId)).toEqual(['engg']);
  });

  it('ignores owner rows for a campus not handed in', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC')],
      [owner('dental', 'NAAC')],
    );
    expect(report.ownedPairs).toBe(0);
  });
});

describe('retired mappings and duplicates', () => {
  it('drops an inactive mapping rather than counting it as a gap', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC'), { institution_id: 'engg', body_code: 'NCTE', is_active: false }],
      [],
    );
    expect(report.declaredPairs).toBe(1);
    expect(report.unowned.map((p) => p.bodyCode)).toEqual(['NAAC']);
  });

  it('treats a mapping with no is_active flag as active', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [{ institution_id: 'engg', body_code: 'NAAC' }],
      [],
    );
    expect(report.declaredPairs).toBe(1);
  });

  it('counts a duplicated mapping once', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC'), row('engg', 'NAAC')],
      [],
    );
    expect(report.declaredPairs).toBe(1);
    expect(report.unowned).toHaveLength(1);
  });
});

describe('gapHeadline', () => {
  it('counts pairs and never grades a college', () => {
    const report = describeOwnershipGaps(INSTITUTIONS, DECLARED, OWNERS);
    expect(gapHeadline(report)).toBe(
      '21 of the 35 campus-and-body pairs have nobody accountable.',
    );
    expect(gapHeadline(report)).not.toMatch(/%/);
  });

  it('says so plainly when nothing is missing', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC')],
      [owner('engg', 'NAAC')],
    );
    expect(gapHeadline(report)).toBe(
      'Every campus-and-body pair you can see (1) has somebody accountable.',
    );
  });

  it('says the matrix is unrecorded rather than claiming completeness', () => {
    const report = describeOwnershipGaps(
      [{ id: 'office', name: 'JKKN Main Office' }],
      [],
      [],
    );
    expect(gapHeadline(report)).toBe(
      'No campus you can see has recorded which awarding bodies it answers to yet.',
    );
  });

  it('uses the singular for exactly one gap', () => {
    const report = describeOwnershipGaps(
      [{ id: 'engg', name: 'Engineering' }],
      [row('engg', 'NAAC')],
      [],
    );
    expect(gapHeadline(report)).toBe(
      '1 of the 1 campus-and-body pair has nobody accountable.',
    );
  });
});
