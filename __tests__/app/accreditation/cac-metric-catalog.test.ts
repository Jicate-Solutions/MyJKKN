/**
 * The CAC catalog and its institution grouping.
 *
 * These two modules are the only places where the CEO's framework and the
 * Director's four decisions exist as enforceable rules rather than as prose in a
 * document. The tests below check the rules, not the rendering:
 *
 *   - the catalog still matches the source document (6 categories, 48 CEO
 *     metrics — a row JKKN adds must mark itself and cannot dilute that count);
 *   - nothing can quietly acquire a score, a weight or a total;
 *   - every metric states where its number comes from or why there is none;
 *   - the three institution groups keep every institution and lose none.
 *
 * A failure here means the page would misrepresent the framework, which is the
 * specific harm this build exists to avoid.
 */

import { describe, it, expect } from 'vitest';
import {
  CAC_METRIC_CATALOG,
  CAC_CATALOG_VERSION,
  allMetrics,
  summariseCatalog,
  substrateReason,
} from '@/app/(routes)/accreditation/cac/_lib/cac-metric-catalog';
import {
  groupInstitutions,
  isCollege,
  isSchool,
  groupedInstitutionLabel,
  SCHOOL_NAMES,
  type GroupableInstitution,
} from '@/app/(routes)/accreditation/cac/_lib/cac-institution-groups';

describe('CAC metric catalog — fidelity to the CEO document', () => {
  it('carries the six categories, in the document order', () => {
    expect(CAC_METRIC_CATALOG.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CAC_METRIC_CATALOG.map((c) => c.title)).toEqual([
      'Learner Centricity',
      'Academic Coordination',
      'Quality Enhancement',
      'Institutional Governance',
      'Research & Collaboration',
      'Professional Development',
    ]);
  });

  it('carries the document\'s 48 leaf metrics, and counts them separately from anything JKKN adds', () => {
    // The count that has to stay pinned is the CEO's, not the table's. A row
    // JKKN adds is legitimate; a row that quietly passes as the CEO's is not.
    const ceoMetrics = allMetrics().filter((m) => !m.addedBy);
    expect(ceoMetrics).toHaveLength(48);
    expect(allMetrics().length).toBeGreaterThanOrEqual(ceoMetrics.length);
  });

  it('gives every JKKN-added row a label the reader can see is not the CEO\'s', () => {
    // `parent` is the only field printed beside the label, so it is where the
    // distinction has to live — a marker visible only to this test would leave
    // the screen still showing an invented quotation.
    for (const metric of allMetrics().filter((m) => m.addedBy)) {
      expect(metric.addedBy).toBe('jkkn');
      expect(metric.parent, `${metric.id} must say on screen that it is not the CEO's`)
        .toMatch(/JKKN/);
    }
  });

  it('gives every category a stated objective', () => {
    for (const category of CAC_METRIC_CATALOG) {
      expect(category.objective.trim().length).toBeGreaterThan(0);
      expect(category.objective.endsWith('.')).toBe(true);
    }
  });

  it('keeps every metric id unique, because the id is the key the database returns', () => {
    const ids = allMetrics().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is versioned, so a reissued framework is visibly a different one', () => {
    expect(CAC_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('CAC metric catalog — the Director decisions it has to enforce', () => {
  it('holds no weight, score, mark or maximum on any metric', () => {
    // Decision 1: measurement, never a grade. The 860-vs-900 confusion came from
    // marks nobody could derive, so the shape that carries them is absent here.
    const banned = ['weight', 'weightage', 'score', 'marks', 'maxMarks', 'ceiling'];
    for (const metric of allMetrics()) {
      for (const key of banned) {
        expect(metric).not.toHaveProperty(key);
      }
    }
  });

  it('explains every metric, whether it has a number or not', () => {
    // Decision 2 only works if the reason is specific. "Not captured yet" with
    // no explanation is not honesty, it is a shrug.
    for (const metric of allMetrics()) {
      expect(metric.evidence.trim().length).toBeGreaterThan(20);
      expect(metric.ceoLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every substrate state a reason line the page can print', () => {
    for (const state of [
      'measured',
      'awaiting-entry',
      'cluster-only',
      'no-substrate',
    ] as const) {
      expect(substrateReason(state).trim().length).toBeGreaterThan(0);
    }
  });

  it('leaves no metric out of the measured / not-captured split', () => {
    const summary = summariseCatalog();
    expect(summary.categories).toBe(6);
    // Every row lands on exactly one side of the split — the page prints this
    // total, so a row escaping the tally would be a row printed under no state.
    expect(summary.metrics).toBe(allMetrics().length);
    expect(summary.measured + summary.notCaptured).toBe(allMetrics().length);
    // The working slice: a minority is wired, and that is the honest position.
    expect(summary.measured).toBeGreaterThan(0);
    expect(summary.measured).toBeLessThan(summary.metrics);
  });

  it('marks the metrics a school cannot have as college-only', () => {
    // Decision 3's purpose: publications and patents must not render as a blank
    // failure against a matriculation school.
    const collegeOnly = ['publications', 'patents-ipr', 'research-grants'];
    for (const id of collegeOnly) {
      const metric = allMetrics().find((m) => m.id === id);
      expect(metric, `metric ${id} is missing`).toBeDefined();
      expect(metric!.scope).toBe('college');
    }
  });

  it('does not fill two different metrics from one source', () => {
    // Start-up activity exists once in the platform; reporting it under both
    // "Entrepreneurship & Start-ups" and "Incubation & Start-up Activities"
    // would present a single number as two independent findings.
    const entrepreneurship = allMetrics().find(
      (m) => m.id === 'holistic-entrepreneurship',
    );
    const incubation = allMetrics().find((m) => m.id === 'incubation-startups');
    expect(entrepreneurship!.substrate).toBe('no-substrate');
    expect(incubation!.substrate).toBe('cluster-only');
  });
});

describe('holistic development — outbound learner participation', () => {
  const sports = () => allMetrics().find((m) => m.id === 'holistic-sports')!;
  const cultural = () => allMetrics().find((m) => m.id === 'holistic-cultural')!;

  it('leaves the CEO framework itself untouched', () => {
    // Broadening the evidence must not become "add a metric". The document has
    // 48 leaf metrics, these two carry the document's own wording, and the ids
    // are the keys fn_cac_measured_metrics returns — all three are fixed.
    expect(allMetrics().filter((m) => !m.addedBy)).toHaveLength(48);
    expect(sports().ceoLabel).toBe('Sports');
    expect(cultural().ceoLabel).toBe('Cultural Activities');
    expect(sports().parent).toBe('Holistic Development');
    expect(cultural().parent).toBe('Holistic Development');
  });

  it('names outbound participation and where it is read from', () => {
    // The gap this closes: a state-level tournament our learners travel to
    // creates no `events` row, so a hosted-only metric earns nothing for it.
    for (const metric of [sports(), cultural()]) {
      expect(metric.evidence).toContain('health_sports_achievements');
      expect(metric.evidence.toLowerCase()).toContain('outbound');
    }
    expect(sports().evidence).toContain('event_level above the institution');
  });

  it('counts only levels above the institution, so nothing is counted twice', () => {
    // intra_college activity is already a hosted `events` row. Naming it as an
    // outbound level here would report one activity as two.
    for (const level of ['inter_college', 'district', 'state', 'national', 'international']) {
      expect(sports().evidence).toContain(level);
    }
    expect(sports().evidence).not.toContain('intra_college');
  });

  it('keeps verified rows distinguishable from unverified ones', () => {
    for (const metric of [sports(), cultural()]) {
      expect(metric.evidence).toMatch(/verified/);
      expect(metric.evidence).toMatch(/unverified/);
    }
  });

  it('does not claim broad outbound participation exists', () => {
    // The source held one unverified row when this was written. The honest
    // position is that the route is open and empty, and the string has to carry
    // the date so a reader knows it is a dated observation.
    expect(sports().evidence).toContain('2026-07-30');
    expect(cultural().evidence).toContain('2026-07-30');
    for (const metric of [sports(), cultural()]) {
      expect(metric.evidence).not.toMatch(/broad outbound/i);
      expect(metric.evidence).not.toMatch(/well[- ]evidenced/i);
    }
  });

  it('asserts no NAAC metric number for the outbound half', () => {
    // Numbering varies between SSR versions and between the university and
    // affiliated-college manuals, and nobody has checked it against the current
    // template. A confident 5.3.1 on screen would be a fabricated citation.
    for (const metric of [sports(), cultural()]) {
      expect(metric.evidence).not.toMatch(/\b\d\.\d(\.\d)?\b/);
      expect(metric.evidence).not.toMatch(/NAAC/);
    }
  });

  it('still reports the hosted half rather than replacing it', () => {
    // Both metrics keep their measured state: the hosted events are real
    // numbers today and the outbound read does not take their place.
    expect(sports().substrate).toBe('measured');
    expect(cultural().substrate).toBe('measured');
    expect(sports().evidence).toContain('events_registrations');
    expect(cultural().evidence).toContain('events_registrations');
  });
});

describe('interdisciplinary work — teaching and research are two different gaps', () => {
  const bestPractices = () =>
    allMetrics().filter((m) => m.parent === 'Best Practices');
  const research = () =>
    CAC_METRIC_CATALOG.find((c) => c.title === 'Research & Collaboration')!;
  const researchInterdisciplinary = () =>
    research().metrics.find((m) => m.id === 'research-interdisciplinary')!;

  it('measures interdisciplinary work as a teaching practice exactly once', () => {
    // The CEO's single line pairs "interdisciplinary" with "multidisciplinary".
    // If a second Best Practices row ever picks up the same word the two would
    // be reported as independent findings about one thing.
    const named = bestPractices().filter((m) => /interdisciplin/i.test(m.ceoLabel));
    expect(named).toHaveLength(1);
    expect(named[0].id).toBe('bp-interdisciplinary');
    expect(named[0].ceoLabel).toMatch(/multidisciplin/i);
  });

  it('says on that row that it is about teaching and not research', () => {
    // The bug: a reader saw "Interdisciplinary & Multidisciplinary Learning"
    // present in the catalog and concluded interdisciplinary work was covered.
    // Nothing on the row said which half of it was meant.
    const bp = allMetrics().find((m) => m.id === 'bp-interdisciplinary')!;
    expect(bp.evidence).toMatch(/research/i);
    expect(bp.parent).toBe('Best Practices');
  });

  it('measures interdisciplinary research under Research & Collaboration', () => {
    // Filed by category membership, not by reading a label — this is the
    // re-filing the fix exists to make, so the test has to check the location.
    expect(researchInterdisciplinary()).toBeDefined();
    expect(bestPractices().map((m) => m.id)).not.toContain('research-interdisciplinary');
  });

  it('does not call a derivable dimension unbuildable', () => {
    // The whole point. `no-substrate` tells a reader they face an engineering
    // gap; here the tables exist and are empty, which is a data-entry gap. The
    // two demand different work from different people, and the second locked
    // decision exists so the screen can tell them apart.
    const metric = researchInterdisciplinary();
    expect(metric.substrate).not.toBe('no-substrate');
    expect(metric.substrate).toBe('awaiting-entry');
    // Not `cluster-only` either: sh_publications carries institution_id, so a
    // per-institution figure is possible once a row exists.
    expect(metric.scope).toBe('college');
  });

  it('names the two tables the figure would be derived from', () => {
    // An "awaiting-entry" claim is only checkable if the row says what it is
    // waiting on. Without the table names a reader cannot confirm the substrate
    // exists, and the state degrades into an unfalsifiable reassurance.
    const evidence = researchInterdisciplinary().evidence;
    expect(evidence).toContain('sh_publications');
    expect(evidence).toContain('sh_publication_contributors');
    // A dated observation, per the file's counting rule for empty tables.
    expect(evidence).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('keeps every id unique once the research row is added', () => {
    const ids = allMetrics().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('research-interdisciplinary');
    expect(ids).toContain('bp-interdisciplinary');
  });

  it('carries no score on the added row either', () => {
    // Decision 1 applies to a JKKN addition exactly as it does to a CEO line.
    for (const key of ['weight', 'weightage', 'score', 'marks', 'ceiling']) {
      expect(researchInterdisciplinary()).not.toHaveProperty(key);
    }
  });
});

describe('institution grouping', () => {
  const institutions: GroupableInstitution[] = [
    { id: 'c1', name: 'JKKN College of Pharmacy', iqac_code: 'PHAR' },
    { id: 'c2', name: 'JKKN College of Engineering and Technology', iqac_code: 'ENGG' },
    { id: 's1', name: 'JKKN Matric Higher Secondary School', iqac_code: null },
    { id: 's2', name: 'Nattraja Vidhyalya CBSE', iqac_code: null },
    { id: 'o1', name: 'Jicate Solutions', iqac_code: null },
    { id: 'o2', name: 'JKKN Main Office', iqac_code: null },
    { id: 'o3', name: 'JKKN Testing Institution', iqac_code: null },
    { id: 'o4', name: 'Nattraja Incubation Forum', iqac_code: null },
  ];

  it('splits into colleges, schools and other entities', () => {
    const [colleges, schools, other] = groupInstitutions(institutions);
    expect(colleges.institutions.map((i) => i.id)).toEqual(['c2', 'c1']); // by code
    expect(schools.institutions.map((i) => i.id)).toEqual(['s1', 's2']);
    expect(other.institutions.map((i) => i.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
  });

  it('loses no institution', () => {
    const total = groupInstitutions(institutions).reduce(
      (n, g) => n + g.institutions.length,
      0,
    );
    expect(total).toBe(institutions.length);
  });

  it('collapses only the non-teaching group', () => {
    const groups = groupInstitutions(institutions);
    expect(groups.map((g) => g.collapsedByDefault)).toEqual([false, false, true]);
  });

  it('returns all three groups even when one is empty, so headings do not flicker', () => {
    const groups = groupInstitutions([institutions[0]]);
    expect(groups.map((g) => g.id)).toEqual(['colleges', 'schools', 'other']);
    expect(groups[1].institutions).toHaveLength(0);
  });

  it('treats an unknown institution as "other" rather than dropping it', () => {
    // The safe direction: a new institution appears in the wrong group, which
    // someone can see and fix. The opposite default would hide it entirely.
    const [, , other] = groupInstitutions([
      { id: 'x', name: 'Some New Entity', iqac_code: null },
    ]);
    expect(other.institutions.map((i) => i.id)).toEqual(['x']);
  });

  it('promotes a school to college the day it is given an IQAC code', () => {
    const [colleges, schools] = groupInstitutions([
      { id: 's1', name: 'JKKN Matric Higher Secondary School', iqac_code: 'MHSS' },
    ]);
    expect(colleges.institutions).toHaveLength(1);
    expect(schools.institutions).toHaveLength(0);
  });

  it('matches school names regardless of case and stray whitespace', () => {
    expect(isSchool({ id: 'x', name: '  nattraja vidhyalya cbse ', iqac_code: null })).toBe(true);
    expect(isSchool({ id: 'y', name: 'Jicate Solutions', iqac_code: null })).toBe(false);
  });

  it('does not treat a blank IQAC code as a college', () => {
    expect(isCollege({ id: 'x', name: 'Anything', iqac_code: '   ' })).toBe(false);
    expect(isCollege({ id: 'y', name: 'Anything', iqac_code: 'PHAR' })).toBe(true);
  });

  it('labels institutions the way the council surfaces on this page do', () => {
    expect(
      groupedInstitutionLabel({ id: 'c', name: 'JKKN College of Pharmacy', iqac_code: 'PHAR' }),
    ).toBe('[PHAR] JKKN College of Pharmacy');
    expect(
      groupedInstitutionLabel({ id: 'o', name: 'JKKN Main Office', iqac_code: null }),
    ).toBe('JKKN Main Office');
  });

  it('names exactly the two schools', () => {
    expect(SCHOOL_NAMES).toHaveLength(2);
  });
});
