// __tests__/app/accreditation/visible-institutions.test.ts
// ============================================================================
// The bug these tests exist to catch is a SENTENCE, not a number: every
// accreditation body dashboard told every reader "Cluster (all 8 colleges)",
// including a principal entitled to one. The evidence underneath was already
// scoped by RLS, so the reader saw one college's rows under a heading claiming
// eight — which reads as "the cluster is nearly empty".
//
// So the assertions below are on the STRINGS A READER SEES, for three distinct
// fake people. `describeVisibleScope` returns the option rows verbatim and the
// pages map them 1:1, so these are the rendered labels and not a parallel
// re-derivation of them. A test that re-computed the intersection itself and
// then checked the function agreed would prove only that two copies of the same
// idea match — which is exactly the failure mode this file must avoid.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  describeVisibleScope,
  AGGREGATE_SCOPE,
  NO_VISIBLE_SCOPE,
  NO_VISIBLE_LABEL,
  type AssessedCollege,
} from '@/app/(routes)/accreditation/_lib/visible-institutions';

/** The eight iqac-coded colleges, in the order the switcher lists them. */
const ASSESSED: AssessedCollege[] = [
  { id: 'i-01', name: 'JKKN College of Engineering and Technology', iqac_code: 'JKKN-ENG' },
  { id: 'i-02', name: 'JKKN College of Pharmacy', iqac_code: 'JKKN-PHM' },
  { id: 'i-03', name: 'JKKN Dental College and Hospital', iqac_code: 'JKKN-DEN' },
  { id: 'i-04', name: 'JKKN College of Nursing', iqac_code: 'JKKN-NUR' },
  { id: 'i-05', name: 'JKKN College of Allied Health Sciences', iqac_code: 'JKKN-AHS' },
  { id: 'i-06', name: 'JKKN College of Arts and Science', iqac_code: 'JKKN-ART' },
  { id: 'i-07', name: 'JKKN College of Education', iqac_code: 'JKKN-EDU' },
  { id: 'i-08', name: 'Sresakthimayeil Institute of Nursing', iqac_code: 'JKKN-SIN' },
];

/** Three real access shapes, named after who actually holds them. */
const REGISTRAR = ASSESSED.map((c) => c.id); //           institution_scope='all'
const PRINCIPAL_OF_PHARMACY = ['i-02']; //                institution_scope='own'
const OFFICER_WITH_THREE_GRANTS = ['i-02', 'i-05', 'i-07']; // own + 2 grants

/** Every label the switcher would render, in order. */
const labelsFor = (visibleIds: readonly string[], known = true) =>
  describeVisibleScope(ASSESSED, visibleIds, known).options.map((o) => o.label);

describe('the switcher heading, for three different readers', () => {
  it('a registrar who can see every college reads "Cluster (all 8 colleges)"', () => {
    const scope = describeVisibleScope(ASSESSED, REGISTRAR, true);

    expect(scope.aggregateLabel).toBe('Cluster (all 8 colleges)');
    expect(labelsFor(REGISTRAR)[0]).toBe('Cluster (all 8 colleges)');
    expect(scope.defaultSelection).toBe(AGGREGATE_SCOPE);
    expect(scope.options).toHaveLength(9); // aggregate + 8
  });

  it('a principal entitled to one college reads that college and "(your college)"', () => {
    const scope = describeVisibleScope(ASSESSED, PRINCIPAL_OF_PHARMACY, true);

    expect(labelsFor(PRINCIPAL_OF_PHARMACY)).toEqual([
      'JKKN College of Pharmacy (your college)',
    ]);
    expect(scope.defaultSelection).toBe('i-02');
  });

  it('an officer with three grants reads a COUNT, not a name list', () => {
    const scope = describeVisibleScope(ASSESSED, OFFICER_WITH_THREE_GRANTS, true);

    expect(scope.aggregateLabel).toBe('The 3 colleges you can see');
    expect(labelsFor(OFFICER_WITH_THREE_GRANTS)).toEqual([
      'The 3 colleges you can see',
      '[JKKN-PHM] JKKN College of Pharmacy',
      '[JKKN-AHS] JKKN College of Allied Health Sciences',
      '[JKKN-EDU] JKKN College of Education',
    ]);
    expect(scope.defaultSelection).toBe(AGGREGATE_SCOPE);
  });

  it('still reports all three as a positively-read scope', () => {
    // Guard for the state field itself: adding a fourth state must not quietly
    // reclassify a reader who CAN see colleges as unread or as none-visible.
    for (const ids of [REGISTRAR, PRINCIPAL_OF_PHARMACY, OFFICER_WITH_THREE_GRANTS]) {
      const scope = describeVisibleScope(ASSESSED, ids, true);
      expect(scope.state).toBe('known');
      expect(scope.known).toBe(true);
      expect(scope.visible.length).toBeGreaterThan(0);
    }
  });

  it('gives the three readers three DIFFERENT headings', () => {
    const headings = [
      REGISTRAR,
      PRINCIPAL_OF_PHARMACY,
      OFFICER_WITH_THREE_GRANTS,
    ].map((ids) => labelsFor(ids)[0]);

    // The original bug is precisely that these three were one string. If a
    // hardcoded label is reintroduced anywhere, this collapses.
    expect(new Set(headings).size).toBe(3);
  });
});

describe('the one-college reader is never offered an aggregate row', () => {
  // The branch a reviewer is most likely to lose: renaming the "Cluster" row
  // but leaving it in place tells the same untruth in a quieter voice, and the
  // reader can still select a scope they are not entitled to.
  it('drops the aggregate row entirely', () => {
    const scope = describeVisibleScope(ASSESSED, PRINCIPAL_OF_PHARMACY, true);

    expect(scope.aggregateLabel).toBeNull();
    expect(scope.options.some((o) => o.value === AGGREGATE_SCOPE)).toBe(false);
    expect(scope.options).toHaveLength(1);
  });

  it('never says "cluster" or a college count to that reader', () => {
    for (const label of labelsFor(PRINCIPAL_OF_PHARMACY)) {
      expect(label.toLowerCase()).not.toContain('cluster');
      expect(label).not.toMatch(/\ball \d+\b/);
    }
  });

  it('defaults the selection to a row that actually exists', () => {
    const scope = describeVisibleScope(ASSESSED, PRINCIPAL_OF_PHARMACY, true);
    expect(scope.options.map((o) => o.value)).toContain(scope.defaultSelection);
  });
});

describe('an unread scope claims nothing and changes nothing', () => {
  // Fail OPEN on behaviour, fail CLOSED on the claim — the same rule
  // UNPROVISIONED_SCOPE applies next door. An answer we could not read is not
  // the same fact as "this person sees nothing", and rendering it as a count
  // would invent a number out of a failed request.
  it('shows the full list but asserts no count when the access read has not answered', () => {
    const scope = describeVisibleScope(ASSESSED, [], false);

    expect(scope.state).toBe('unread');
    expect(scope.known).toBe(false);
    expect(scope.options).toHaveLength(9);
    expect(scope.defaultSelection).toBe(AGGREGATE_SCOPE);
    expect(scope.visibleIds).toEqual(ASSESSED.map((c) => c.id));
  });

  it('never puts a number in the heading of an unread scope', () => {
    // The whole point of the unread branch: a count would be invented out of a
    // request that never answered.
    const scope = describeVisibleScope(ASSESSED, [], false);

    expect(scope.aggregateLabel).not.toMatch(/\d/);
    expect(scope.aggregateLabel?.toLowerCase()).not.toContain('cluster');
  });

  it('admits in the heading that the access was not confirmed', () => {
    // A bare "All colleges" reads as a statement about the READER — the one
    // claim an unread scope may not make. The heading must describe the list
    // and flag the gap, the way scopeSentence() does for an unprovisioned body
    // scope next door.
    const scope = describeVisibleScope(ASSESSED, [], false);

    expect(scope.aggregateLabel).toBe('All colleges (access not confirmed)');
  });

  it('does not say "all 0 colleges" when there are no assessed colleges at all', () => {
    // Still unread, and deliberately so: an empty registry cannot be told apart
    // from a registry read that failed, so it is a fact about the READ.
    const scope = describeVisibleScope([], [], true);

    expect(scope.state).toBe('unread');
    expect(scope.known).toBe(false);
    expect(scope.options).toEqual([
      { value: AGGREGATE_SCOPE, label: 'All colleges (access not confirmed)' },
    ]);
  });
});

describe('a reader with no assessed college is told exactly that', () => {
  // 1,070 production profiles sit in this state (verified live 2026-08-13):
  // every account whose institution has iqac_code IS NULL — Jicate Solutions,
  // JKKN Main Office, JKKN Matric Higher Secondary School, JKKN Testing
  // Institution, Nattraja Incubation Forum, Nattraja Vidhyalya CBSE. Their
  // access read ANSWERS and returns exactly one campus, which is not assessed.
  //
  // This used to share the unread branch, so all 1,070 were shown "All
  // colleges" over a dropdown offering every one of the eight — a larger
  // untruth than the hardcoded "Cluster (all 8 colleges)" this module was
  // written to delete.
  const AT_A_NON_ASSESSED_CAMPUS = ['i-99-jkkn-testing-institution'];

  it('does not tell them they can see all colleges', () => {
    const scope = describeVisibleScope(ASSESSED, AT_A_NON_ASSESSED_CAMPUS, true);

    expect(scope.state).toBe('none-visible');
    expect(scope.aggregateLabel).toBeNull();
    for (const label of scope.options.map((o) => o.label)) {
      expect(label).not.toBe('All colleges');
      expect(label).not.toContain('All colleges');
      expect(label.toLowerCase()).not.toContain('cluster');
    }
  });

  it('offers no college the reader cannot see, and no aggregate', () => {
    const scope = describeVisibleScope(ASSESSED, AT_A_NON_ASSESSED_CAMPUS, true);

    // Not "fewer colleges" — NONE of them. Every assessed college is one this
    // reader cannot open, so none of the eight names or ids may appear in a row
    // they are able to select.
    const offered = scope.options.map((o) => o.value);
    for (const college of ASSESSED) {
      expect(offered).not.toContain(college.id);
    }
    const rendered = scope.options.map((o) => o.label).join(' | ');
    for (const college of ASSESSED) {
      expect(rendered).not.toContain(college.name);
    }
    expect(offered).not.toContain(AGGREGATE_SCOPE);
  });

  it('says so plainly, and defaults to that row', () => {
    const scope = describeVisibleScope(ASSESSED, AT_A_NON_ASSESSED_CAMPUS, true);

    expect(scope.options).toEqual([
      { value: NO_VISIBLE_SCOPE, label: NO_VISIBLE_LABEL },
    ]);
    expect(NO_VISIBLE_LABEL).toBe('No accredited college in your access');
    expect(scope.options.map((o) => o.value)).toContain(scope.defaultSelection);
  });

  it('hands the pages an empty college list AND the flag that says it is a fact', () => {
    // `visible: []` alone is ambiguous — the unread branch has a FULL list for
    // the opposite reason. `known`/`state` are what let a page tell "nothing to
    // measure" apart from "not measured yet" and refuse to print a rollup of
    // nought under "of 900". Same refusal as measurementState().
    const scope = describeVisibleScope(ASSESSED, AT_A_NON_ASSESSED_CAMPUS, true);

    expect(scope.visible).toEqual([]);
    expect(scope.visibleIds).toEqual([]);
    expect(scope.known).toBe(true);
  });

  it('is a different verdict from an unread scope, on the same empty intersection', () => {
    // The exact conflation this branch exists to prevent: identical college
    // list, identical (empty) intersection, one bit of difference in whether
    // the access read answered — and two different sentences must come out.
    const unread = describeVisibleScope(ASSESSED, AT_A_NON_ASSESSED_CAMPUS, false);
    const knownEmpty = describeVisibleScope(ASSESSED, AT_A_NON_ASSESSED_CAMPUS, true);

    expect(unread.state).toBe('unread');
    expect(knownEmpty.state).toBe('none-visible');
    expect(unread.options.length).not.toBe(knownEmpty.options.length);
    expect(unread.options[0].label).not.toBe(knownEmpty.options[0].label);
  });
});

describe('the count is derived, never typed', () => {
  it('says nine when a ninth college is seeded', () => {
    const nine = [...ASSESSED, { id: 'i-09', name: 'JKKN School of Law', iqac_code: 'JKKN-LAW' }];
    const scope = describeVisibleScope(nine, nine.map((c) => c.id), true);

    // The literal 8 was hardcoded in three page files. If it comes back, this
    // is the assertion that fails.
    expect(scope.aggregateLabel).toBe('Cluster (all 9 colleges)');
  });

  it('avoids "all 1 colleges" if the cluster ever shrinks to one', () => {
    const one = [ASSESSED[0]];
    const scope = describeVisibleScope(one, [one[0].id], true);

    expect(scope.aggregateLabel).toBe('Cluster (1 college)');
    expect(scope.aggregateLabel).not.toContain('colleges');
  });
});

describe('the rows carry the ids the evidence queries are filtered by', () => {
  it('lists only the reader’s colleges, in registry order', () => {
    const scope = describeVisibleScope(ASSESSED, ['i-07', 'i-02'], true);

    // Registry order, not the order the grants happened to arrive in.
    expect(scope.visibleIds).toEqual(['i-02', 'i-07']);
    expect(scope.options.slice(1).map((o) => o.value)).toEqual(['i-02', 'i-07']);
  });

  it('ignores an accessible id that is not an assessed college', () => {
    const scope = describeVisibleScope(ASSESSED, ['i-02', 'i-05', 'not-a-college'], true);

    expect(scope.visibleIds).toEqual(['i-02', 'i-05']);
    expect(scope.aggregateLabel).toBe('The 2 colleges you can see');
  });
});
