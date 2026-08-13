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

    expect(scope.known).toBe(false);
    expect(scope.aggregateLabel).toBe('All colleges');
    expect(scope.aggregateLabel).not.toMatch(/\d/);
    expect(scope.options).toHaveLength(9);
    expect(scope.defaultSelection).toBe(AGGREGATE_SCOPE);
    expect(scope.visibleIds).toEqual(ASSESSED.map((c) => c.id));
  });

  it('treats an empty intersection as unread, not as "you see nothing"', () => {
    // A campus with no iqac_code produces this. Declaring "No colleges you can
    // see" over a provisioning gap would be its own false claim — and would
    // hand the NAAC rollup an empty college list, turning a missing answer
    // into a measured "0 of 900".
    const scope = describeVisibleScope(ASSESSED, ['i-99-not-assessed'], true);

    expect(scope.known).toBe(false);
    expect(scope.aggregateLabel).toBe('All colleges');
    expect(scope.visible).toHaveLength(ASSESSED.length);
  });

  it('does not say "all 0 colleges" when there are no assessed colleges at all', () => {
    const scope = describeVisibleScope([], [], true);

    expect(scope.known).toBe(false);
    expect(scope.aggregateLabel).toBe('All colleges');
    expect(scope.options).toEqual([{ value: AGGREGATE_SCOPE, label: 'All colleges' }]);
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
