/**
 * The CAC catalog and its institution grouping.
 *
 * These two modules are the only places where the CEO's framework and the
 * Director's four decisions exist as enforceable rules rather than as prose in a
 * document. The tests below check the rules, not the rendering:
 *
 *   - the catalog still matches the source document (6 categories, 48 metrics);
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

  it('carries 48 leaf metrics', () => {
    expect(allMetrics()).toHaveLength(48);
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

  it('counts measured and not-captured metrics to exactly 48 between them', () => {
    const summary = summariseCatalog();
    expect(summary.categories).toBe(6);
    expect(summary.metrics).toBe(48);
    expect(summary.measured + summary.notCaptured).toBe(48);
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
    expect(allMetrics()).toHaveLength(48);
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
