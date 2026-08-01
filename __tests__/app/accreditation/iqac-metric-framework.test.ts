/**
 * The IQAC framework grouping, and the 48 -> 107 mapping register.
 *
 * The specific harm these tests exist to prevent: production spells two NAAC
 * attributes two ways each, so grouping the 107 metrics on the raw `category`
 * string yields TWELVE NAAC sections where the framework has TEN. Attribute 9
 * and Attribute 10 each appear twice, each showing part of the metric list under
 * a heading that looks complete. Nobody reading the page would notice, because
 * nothing is missing — it is filed twice.
 *
 * So the first three tests pin the merge, and the fourth pins the accounting:
 * every row handed in comes back out, in exactly one group.
 *
 * The fixture is the real production distribution, read live on 2026-08-01:
 * 107 rows, 10 bodies, NAAC 69 / NIRF 17 / NBA 9 / INC 2 / PCI 2 / DCI 2 / QS 2
 * / UGC 2 / AICTE 1 / NCTE 1, `weightage` NULL on every one.
 *
 * It lives in fixtures/iqac-framework-categories.json rather than inline because
 * those category strings are VERBATIM DATABASE VALUES, not copy — three of them
 * carry terms the JKKN terminology standard replaces in learner-facing prose,
 * and rewriting them would make the fixture a lie about what the table holds.
 * Data belongs in a data file; that file records where it came from and the
 * query that regenerates it.
 */

import { describe, it, expect } from 'vitest';
import {
  categoryKey,
  attributeNumber,
  groupFramework,
  summariseCoverage,
  measurementState,
  evidenceKey,
  UNCATEGORISED_KEY,
  type FrameworkMetricRow,
} from '@/app/(routes)/accreditation/iqac/_lib/metric-framework';
import {
  indexMappings,
  summariseMappings,
  type IqacMetricMapRow,
} from '@/lib/services/accreditation/iqac-metric-map-service';

// ---------------------------------------------------------------------------
// Fixture — the live category distribution, expanded to one row per metric.
// ---------------------------------------------------------------------------

import fixture from './fixtures/iqac-framework-categories.json';

const LIVE_DISTRIBUTION = fixture.distribution as [string, string | null, number][];

/** The two attribute numbers production spells two ways. */
const SPLIT_ATTRIBUTES = [9, 10] as const;

function buildFramework(): FrameworkMetricRow[] {
  const rows: FrameworkMetricRow[] = [];
  let n = 0;
  for (const [body, category, count] of LIVE_DISTRIBUTION) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      rows.push({
        metric_type: body,
        metric_code: `${body}-${String(n).padStart(3, '0')}`,
        metric_name: `${category ?? 'Uncategorised'} metric ${i + 1}`,
        category,
        max_score: 10,
        weightage: null, // NULL on all 107 in production
      });
    }
  }
  return rows;
}

const FRAMEWORK = buildFramework();

describe('the fixture matches what production actually holds', () => {
  it('carries 107 rows across 10 bodies', () => {
    expect(FRAMEWORK).toHaveLength(107);
    expect(new Set(FRAMEWORK.map((r) => r.metric_type)).size).toBe(10);
  });

  it('matches the per-body counts read live on 2026-08-01', () => {
    const perBody: Record<string, number> = {};
    for (const row of FRAMEWORK) {
      perBody[row.metric_type] = (perBody[row.metric_type] ?? 0) + 1;
    }
    expect(perBody).toEqual(fixture.expectedPerBody);
  });

  it('really does spell both split attributes two ways', () => {
    // If production is ever cleaned up and the fixture is refreshed, this fails
    // — and it should. The merge tests below would then be asserting a trap that
    // no longer exists, which is worse than not having them.
    for (const attribute of SPLIT_ATTRIBUTES) {
      const spellings = new Set(
        FRAMEWORK.filter((r) => attributeNumber(r.category) === attribute).map(
          (r) => r.category,
        ),
      );
      expect(spellings.size).toBe(2);
    }
  });
});

describe('categoryKey normalises on the attribute prefix, not the free-text tail', () => {
  it('gives the two Attribute 10 spellings the same key', () => {
    expect(categoryKey('Attribute 10: Sustainability')).toBe(
      categoryKey('Attribute 10: Sustainability & Green Initiatives'),
    );
    expect(categoryKey('Attribute 10: Sustainability')).toBe('attribute-10');
  });

  it('gives the two Attribute 9 spellings the same key', () => {
    expect(categoryKey('Attribute 9: Research')).toBe(
      categoryKey('Attribute 9: Research & Innovation Outcomes'),
    );
    expect(categoryKey('Attribute 9: Research')).toBe('attribute-9');
  });

  it('keeps different attribute numbers apart', () => {
    expect(categoryKey('Attribute 1: Curriculum')).not.toBe(
      categoryKey('Attribute 10: Sustainability'),
    );
  });

  it('leaves the nine bodies that do not number their categories alone', () => {
    // A key that assumed 'Attribute N:' would collapse all of these into one.
    const bare = ['TLR', 'GO', 'RPC', 'OI', 'PR', 'Tier 1', 'Tier 2', 'Faculty'];
    expect(new Set(bare.map(categoryKey)).size).toBe(bare.length);
  });

  it('treats null and blank as the same absence', () => {
    expect(categoryKey(null)).toBe(UNCATEGORISED_KEY);
    expect(categoryKey('   ')).toBe(UNCATEGORISED_KEY);
  });

  it('reads the attribute number, or null where there is none', () => {
    expect(attributeNumber('Attribute 10: Sustainability')).toBe(10);
    expect(attributeNumber('Tier 1')).toBeNull();
  });
});

describe('groupFramework merges the split attributes into one section each', () => {
  const grouping = groupFramework(FRAMEWORK);
  const naac = grouping.bodies.find((b) => b.body === 'NAAC')!;

  it('gives NAAC ten sections, not twelve', () => {
    expect(naac.categories).toHaveLength(10);
  });

  it('lands both Attribute 10 spellings in ONE group holding all 5 metrics', () => {
    const attr10 = naac.categories.filter((c) => c.attribute === 10);
    expect(attr10).toHaveLength(1);
    expect(attr10[0].metrics).toHaveLength(5);

    const spellings = new Set(attr10[0].metrics.map((m) => m.category));
    expect(spellings).toEqual(
      new Set([
        'Attribute 10: Sustainability',
        'Attribute 10: Sustainability & Green Initiatives',
      ]),
    );
  });

  it('lands both Attribute 9 spellings in ONE group holding all 8 metrics', () => {
    const attr9 = naac.categories.filter((c) => c.attribute === 9);
    expect(attr9).toHaveLength(1);
    expect(attr9[0].metrics).toHaveLength(8);
  });

  it('does NOT hide the losing spelling — both survive with their counts', () => {
    const attr10 = naac.categories.find((c) => c.attribute === 10)!;
    expect(attr10.hasVariantConflict).toBe(true);
    expect(attr10.variants).toEqual([
      { raw: 'Attribute 10: Sustainability & Green Initiatives', count: 4 },
      { raw: 'Attribute 10: Sustainability', count: 1 },
    ]);
  });

  it('reports exactly the two known conflicts, and no others', () => {
    expect(grouping.conflicts.map((c) => c.label).sort()).toEqual([
      'Attribute 10: Sustainability & Green Initiatives',
      'Attribute 9: Research & Innovation Outcomes',
    ]);
  });

  it('shows the fuller spelling as the heading', () => {
    const attr9 = naac.categories.find((c) => c.attribute === 9)!;
    expect(attr9.label).toBe('Attribute 9: Research & Innovation Outcomes');
  });

  it('orders numbered attributes numerically, so 10 follows 9 rather than 1', () => {
    expect(naac.categories.map((c) => c.attribute)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });
});

describe('nothing is silently dropped', () => {
  const grouping = groupFramework(FRAMEWORK);

  it('accounts for all 107 rows', () => {
    expect(grouping.total).toBe(107);
    expect(grouping.accountedFor).toBe(107);
    expect(grouping.isComplete).toBe(true);
  });

  it('returns every metric_code exactly once across every group', () => {
    const seen = grouping.bodies.flatMap((b) =>
      b.categories.flatMap((c) => c.metrics.map((m) => m.metric_code)),
    );
    expect(seen).toHaveLength(107);
    expect(new Set(seen).size).toBe(107);
    expect(new Set(seen)).toEqual(new Set(FRAMEWORK.map((m) => m.metric_code)));
  });

  it('keeps per-body totals intact after grouping', () => {
    for (const body of grouping.bodies) {
      const expected = FRAMEWORK.filter((r) => r.metric_type === body.body).length;
      expect(body.metricCount).toBe(expected);
    }
  });

  it("never lets one body's 'Faculty' section absorb another's", () => {
    // 'Faculty' occurs under DCI, INC, NCTE and PCI. Grouping is body-first.
    const facultyGroups = grouping.bodies.flatMap((b) =>
      b.categories.filter((c) => c.label === 'Faculty').map((c) => b.body),
    );
    expect(facultyGroups.sort()).toEqual(['DCI', 'INC', 'NCTE', 'PCI']);
  });

  it('surfaces a body that is not in the display order rather than dropping it', () => {
    const withStranger = groupFramework([
      ...FRAMEWORK,
      {
        metric_type: 'NEWBODY',
        metric_code: 'NEW-001',
        metric_name: 'A body nobody added to BODY_ORDER',
        category: 'Something',
        max_score: 1,
        weightage: null,
      },
    ]);
    expect(withStranger.isComplete).toBe(true);
    expect(withStranger.total).toBe(108);
    expect(withStranger.bodies.map((b) => b.body)).toContain('NEWBODY');
  });

  it('groups rows with no category at all instead of discarding them', () => {
    const withNulls = groupFramework([
      ...FRAMEWORK,
      {
        metric_type: 'NAAC',
        metric_code: 'NAAC-999',
        metric_name: 'A metric filed under nothing',
        category: null,
        max_score: null,
        weightage: null,
      },
    ]);
    expect(withNulls.accountedFor).toBe(108);
    expect(withNulls.isComplete).toBe(true);
  });

  it('handles an empty framework without claiming completeness is broken', () => {
    const empty = groupFramework([]);
    expect(empty.total).toBe(0);
    expect(empty.isComplete).toBe(true);
    expect(empty.bodies).toEqual([]);
  });
});

describe('measurement state never renders an absence as a zero', () => {
  it('calls a metric with no evidence "not captured yet", not measured', () => {
    expect(measurementState(undefined)).toBe('not-captured-yet');
    expect(measurementState(0)).toBe('not-captured-yet');
    expect(measurementState(1)).toBe('measured');
  });

  it("keys evidence by body AND code, so one body's evidence cannot credit another's metric", () => {
    expect(evidenceKey('NAAC', 'X-1')).not.toBe(evidenceKey('NBA', 'X-1'));
  });

  it('counts answerable against not-yet without producing a grade', () => {
    const counts: Record<string, number> = {};
    for (const row of FRAMEWORK.slice(0, 21)) {
      counts[evidenceKey(row.metric_type, row.metric_code)] = 3;
    }
    const coverage = summariseCoverage(FRAMEWORK, counts);
    expect(coverage).toEqual({ total: 107, measured: 21, notCapturedYet: 86 });
    // No percentage, no score, no maximum — the shape itself refuses a rating.
    expect(Object.keys(coverage).sort()).toEqual([
      'measured',
      'notCapturedYet',
      'total',
    ]);
  });
});

describe('the 48 -> 107 register, which lives in config and not in code', () => {
  const row = (over: Partial<IqacMetricMapRow>): IqacMetricMapRow => ({
    id: Math.random().toString(36).slice(2),
    config_key: 'attendance',
    display_name: 'Attendance',
    description: null,
    body_code: null,
    metric_code: null,
    relationship: 'contributes-to',
    is_active: true,
    ...over,
  });

  it('reports an unprovisioned register as every dimension unexamined', () => {
    const summary = summariseMappings(['a', 'b', 'c'], indexMappings([]));
    expect(summary).toEqual({
      totalDimensions: 3,
      mapped: 0,
      reviewedAsUnmapped: 0,
      unexamined: 3,
    });
  });

  it('separates "checked, no counterpart" from "never looked at"', () => {
    const index = indexMappings([row({ config_key: 'a' })]);
    expect(summariseMappings(['a', 'b'], index)).toEqual({
      totalDimensions: 2,
      mapped: 0,
      reviewedAsUnmapped: 1,
      unexamined: 1,
    });
  });

  it('collects several targets for one dimension', () => {
    const index = indexMappings([
      row({ config_key: 'a', body_code: 'NAAC', metric_code: 'N-1' }),
      row({ config_key: 'a', body_code: 'NIRF', metric_code: 'T-2', relationship: 'evidence-for' }),
    ]);
    expect(index.get('a')!.targets).toHaveLength(2);
    expect(summariseMappings(['a'], index).mapped).toBe(1);
  });

  it('prefers a real mapping over a stale unmapped marker on the same dimension', () => {
    const index = indexMappings([
      row({ config_key: 'a' }),
      row({ config_key: 'a', body_code: 'NAAC', metric_code: 'N-1' }),
    ]);
    expect(index.get('a')!.reviewedAsUnmapped).toBe(false);
    expect(summariseMappings(['a'], index).mapped).toBe(1);
  });
});
