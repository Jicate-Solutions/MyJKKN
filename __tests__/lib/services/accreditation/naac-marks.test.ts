// __tests__/lib/services/accreditation/naac-marks.test.ts
// ============================================================================
// Guards the marks rollup that /accreditation/naac reports against the NAAC
// Binary deck's 900 ceiling.
//
// The fixtures are the REAL post-migration catalog (69 rows — 57 carrying
// marks, 12 legitimately at zero) and the REAL live evidence counts from prod
// kvizhngldtiuufknvehv on 2026-07-26, so the expected totals below are the
// same numbers the dashboard must render (320.29 earned, 17 of 57 metrics).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  NAAC_TOTAL_MARKS,
  formatMarks,
  marksPct,
  rollupNaacMarks,
  sumNaacMarks,
} from '@/lib/services/accreditation/naac-marks';

/** Catalog after migration 20260727090000 — code → max_score. */
const CATALOG: Record<string, number> = {
  // Attribute 1 — 75
  '1.1.1': 15, '1.1.2': 0, '1.2': 10, '1.3.1': 10,
  '1.4': 10, '1.5': 10, '1.6': 5, '1.7': 5, '1.8': 10,
  // Attribute 2 — 50 (scaled 50/85, 0.01 residual on 2.2.3)
  '2.1': 5.88, '2.2.1': 14.71, '2.2.2': 14.71, '2.2.3': 14.7,
  // Attribute 3 — 50
  '3.1.1': 10, '3.2.1': 10, '3.3': 15, '3.4.1': 10, '3.5': 5, '3.6': 0,
  // Attribute 4 — 50
  '4.1': 15, '4.2': 15, '4.3': 10, '4.4.1': 10, '4.4.2': 0,
  // Attribute 5 — 150
  '5.1.1': 35, '5.2.1': 20, '5.3.1': 25, '5.4.1': 25,
  '5.5': 15, '5.6': 15, '5.7': 15,
  // Attribute 6 — 125
  '6.1.1': 25, '6.2': 25, '6.3.1': 15, '6.3.2': 0,
  '6.4.1': 15, '6.5.1': 20, '6.6': 25,
  // Attribute 7 — 100
  '7.1.1': 10, '7.2': 10, '7.3.1': 10, '7.3.d': 0, '7.3.e': 0, '7.3.f': 0,
  '7.4': 0, '7.5': 15, '7.6': 15, '7.7.1': 5, '7.8': 10, '7.9': 10, '7.10.1': 15,
  // Attribute 8 — 125
  '8.1.1': 20, '8.2.1': 30, '8.2.2': 0, '8.3': 15, '8.4.1': 60,
  // Attribute 9 — 100
  '9.1': 20, '9.1.1': 0, '9.2': 25, '9.3': 20, '9.4': 20,
  '9.5': 0, '9.6': 5, '9.7': 10,
  // Attribute 10 — 75
  '10.1': 25, '10.1.1': 0, '10.2': 20, '10.3': 20, '10.4': 10,
};

const METRICS = Object.entries(CATALOG).map(([metric_code, max_score]) => ({
  metric_code,
  max_score,
}));

/** Live NAAC evidence per metric_code, prod 2026-07-26 (148 rows total). */
const LIVE_EVIDENCE: Record<string, number> = {
  '7.3.d': 47, '1.2': 13, '2.2.2': 11, '2.2.3': 11, '7.10.1': 11,
  '2.1': 10, '3.1.1': 8, '8.2.2': 8, '3.4.1': 6, '5.1.1': 6,
  '7.3.f': 4, '5.4.1': 3, '8.2.1': 2, '9.1': 2, '4.4.2': 1,
  '5.3.1': 1, '6.3.1': 1, '6.3.2': 1, '7.1.1': 1, '8.4.1': 1,
};

describe('rollupNaacMarks — the catalog itself', () => {
  it('sums to the deck ceiling of exactly 900', () => {
    expect(rollupNaacMarks(METRICS, {}).marksPossible).toBe(NAAC_TOTAL_MARKS);
  });

  it('counts 57 marks-carrying metrics (12 rows legitimately hold none)', () => {
    const r = rollupNaacMarks(METRICS, {});
    expect(r.metricsWithMarks).toBe(57);
    expect(METRICS.length - r.metricsWithMarks).toBe(12);
  });

  it('earns nothing at all when there is no evidence', () => {
    const r = rollupNaacMarks(METRICS, {});
    expect(r.marksEarned).toBe(0);
    expect(r.metricsEarning).toBe(0);
  });

  it('keeps every attribute at its deck total', () => {
    const r = rollupNaacMarks(METRICS, {});
    const expected: Record<string, number> = {
      '1': 75, '2': 50, '3': 50, '4': 50, '5': 150,
      '6': 125, '7': 100, '8': 125, '9': 100, '10': 75,
    };
    for (const [attr, total] of Object.entries(expected)) {
      const codes = Object.keys(CATALOG).filter((c) => c.split('.')[0] === attr);
      expect(sumNaacMarks(r, codes).marksPossible).toBe(total);
    }
  });
});

describe('rollupNaacMarks — facet credit (the trap this module exists for)', () => {
  const r = rollupNaacMarks(METRICS, LIVE_EVIDENCE);

  it('credits 7.3.d + 7.3.f evidence to 7.3.1, which has none of its own', () => {
    expect(LIVE_EVIDENCE['7.3.1']).toBeUndefined();
    expect(r.byCode['7.3.1']!.marksEarned).toBe(10);
    expect(r.byCode['7.3.1']!.creditedEvidenceRows).toBe(51); // 47 + 4
  });

  it('credits a lone facet row: 4.4.2 earns 4.4.1 its 10 marks', () => {
    expect(r.byCode['4.4.1']!.marksEarned).toBe(10);
    expect(r.byCode['4.4.2']!.marksEarned).toBe(0);
    expect(r.byCode['4.4.2']!.facetOf).toBe('4.4.1');
    expect(r.byCode['4.4.2']!.zeroReason).toBe('facet');
  });

  it('never double-counts: a facet earns 0 for itself even holding evidence', () => {
    expect(r.byCode['7.3.d']!.marksPossible).toBe(0);
    expect(r.byCode['7.3.d']!.marksEarned).toBe(0);
    expect(r.byCode['7.3.d']!.evidenceRows).toBe(47);
    expect(r.byCode['7.3.d']!.creditedEvidenceRows).toBe(0);
  });

  it('does not pay a metric whose facets are all empty (1.1 has no evidence)', () => {
    expect(r.byCode['1.1.1']!.marksEarned).toBe(0);
    expect(r.byCode['1.1.2']!.zeroReason).toBe('facet');
  });
});

describe('rollupNaacMarks — the deck-collision and superseded rows', () => {
  const r = rollupNaacMarks(METRICS, LIVE_EVIDENCE);

  it('never lets 8.2.2 pass-percentage evidence mint 8.2.1 graduate-progression marks', () => {
    // 8.2.1 earns its 30 on its OWN 2 rows, not on 8.2.2's 8.
    expect(r.byCode['8.2.1']!.marksEarned).toBe(30);
    expect(r.byCode['8.2.1']!.creditedEvidenceRows).toBe(2);
    expect(r.byCode['8.2.2']!.facetOf).toBeNull();
  });

  it('flags 8.2.2 as affiliated-only while keeping its evidence visible', () => {
    const row = r.byCode['8.2.2']!;
    expect(row.marksPossible).toBe(0);
    expect(row.marksEarned).toBe(0);
    expect(row.evidenceRows).toBe(8); // never hidden
    expect(row.zeroReason).toBe('affiliated_only');
    expect(row.zeroLabel).toMatch(/Affiliated-only/);
  });

  it('marks 9.1.1 / 10.1.1 superseded, not facets of 9.1 / 10.1', () => {
    for (const code of ['9.1.1', '10.1.1']) {
      expect(r.byCode[code]!.zeroReason).toBe('superseded');
      expect(r.byCode[code]!.facetOf).toBeNull();
    }
  });

  it('labels a deck metric that carries no college marks at all', () => {
    for (const code of ['3.6', '7.4', '9.5']) {
      expect(r.byCode[code]!.zeroReason).toBe('no_college_marks');
    }
  });

  it('gives every zero row a reason — a zero is never unexplained', () => {
    for (const row of Object.values(r.byCode)) {
      if (row.marksPossible === 0) {
        expect(row.zeroReason).not.toBeNull();
        expect(row.zeroLabel).toBeTruthy();
      } else {
        expect(row.zeroReason).toBeNull();
      }
    }
  });
});

// NOTE (2026-07-27): this block is a dated snapshot of the UNSCOPED cluster
// query. The dashboard now folds evidence through the 8-college list before
// rolling it up — see the "cluster evidence scope" block below for the live
// figures it renders. Every assertion here still holds for this fixture.
describe('rollupNaacMarks — the 2026-07-26 unscoped cluster snapshot', () => {
  const r = rollupNaacMarks(METRICS, LIVE_EVIDENCE);

  it('earns 320.29 of 900 from the 148 live evidence rows', () => {
    expect(r.marksEarned).toBe(320.29);
    expect(r.marksPossible).toBe(900);
    expect(r.evidenceRows).toBe(148);
  });

  it('reports 17 of 57 marks-carrying metrics earning', () => {
    expect(r.metricsEarning).toBe(17);
    expect(r.metricsWithMarks).toBe(57);
  });

  // The retired formula was evidence_rows / metrics_seeded = 148 / 51 = 290%,
  // clamped to 100% — which is why the page could never show a real shortfall.
  it('is 35.6% marks-weighted, not the clamped 100% a row-count implied', () => {
    expect(marksPct(r.marksEarned, NAAC_TOTAL_MARKS)).toBe(35.6);
  });

  it('scales Attribute 2 to 50 and earns only the two evidenced sub-metrics', () => {
    const a2 = sumNaacMarks(r, ['2.1', '2.2.1', '2.2.2', '2.2.3']);
    expect(a2.marksPossible).toBe(50);
    // 2.1 (5.88) + 2.2.2 (14.71) + 2.2.3 (14.70); 2.2.1 has no evidence.
    expect(a2.marksEarned).toBe(35.29);
  });

  it('rolls per-attribute earned marks back up to the same 320.29', () => {
    const attrs = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const total = attrs.reduce((sum, attr) => {
      const codes = Object.keys(CATALOG).filter((c) => c.split('.')[0] === attr);
      return sum + sumNaacMarks(r, codes).marksEarned;
    }, 0);
    expect(Math.round(total * 100) / 100).toBe(320.29);
  });
});

// ---------------------------------------------------------------------------
// Cluster evidence scope.
//
// /accreditation/naac fetches cluster evidence with NO institution filter (one
// round-trip feeds both the headline and the per-college table), but its college
// list is `iqac_code IS NOT NULL` — 8 of the 14 rows in `institutions`. On prod
// 2026-07-27 that put 17 of 150 NAAC evidence rows on institutions that are not
// assessed colleges: JKKN Matric HSS + Nattraja Vidhyalya CBSE (school), Jicate
// Solutions (company), JKKN Main Office (admin_office) and JKKN Testing
// Institution. The Evidence-rows tile therefore read 150 under a selector
// labelled "Cluster (all 8 colleges)" while the eight rows beneath it summed to
// 133.
//
// The page now rebuilds the cluster map from the per-institution buckets. These
// tests pin the property that makes that safe: the two populations share an
// identical set of metric codes, so under Binary scoring (full marks on the
// first credited row, no partial credit) NOT ONE MARK MOVES — only the counts.
// ---------------------------------------------------------------------------

/** Every NAAC evidence row, prod 2026-07-27 — 150 rows, 13 institutions. */
const CLUSTER_UNSCOPED: Record<string, number> = {
  '7.3.d': 47, '1.2': 13, '2.2.2': 11, '2.2.3': 11, '7.10.1': 11,
  '2.1': 10, '3.1.1': 8, '8.2.2': 8, '7.3.f': 6, '3.4.1': 6,
  '5.1.1': 6, '5.4.1': 3, '8.2.1': 2, '9.1': 2, '4.4.2': 1,
  '5.3.1': 1, '6.3.1': 1, '6.3.2': 1, '7.1.1': 1, '8.4.1': 1,
};

/** The same rows restricted to the 8 iqac_code colleges — 133 rows. */
const CLUSTER_COLLEGES_ONLY: Record<string, number> = {
  '7.3.d': 47, '1.2': 13, '2.2.2': 8, '2.2.3': 8, '7.10.1': 8,
  '2.1': 7, '3.1.1': 6, '8.2.2': 8, '7.3.f': 5, '3.4.1': 4,
  '5.1.1': 6, '5.4.1': 3, '8.2.1': 2, '9.1': 2, '4.4.2': 1,
  '5.3.1': 1, '6.3.1': 1, '6.3.2': 1, '7.1.1': 1, '8.4.1': 1,
};

describe('rollupNaacMarks — cluster evidence scope', () => {
  const unscoped = rollupNaacMarks(METRICS, CLUSTER_UNSCOPED);
  const colleges = rollupNaacMarks(METRICS, CLUSTER_COLLEGES_ONLY);

  it('has fixtures that total the row counts prod reports (150 and 133)', () => {
    const sum = (m: Record<string, number>) =>
      Object.values(m).reduce((a, b) => a + b, 0);
    expect(sum(CLUSTER_UNSCOPED)).toBe(150);
    expect(sum(CLUSTER_COLLEGES_ONLY)).toBe(133);
  });

  // This is the property the fix rests on. If a future evidence row lands on a
  // metric that ONLY a non-college institution can evidence, this breaks first
  // and the scope change stops being marks-neutral.
  it('drops no metric code when non-college institutions are excluded', () => {
    expect(Object.keys(CLUSTER_COLLEGES_ONLY).sort()).toEqual(
      Object.keys(CLUSTER_UNSCOPED).sort(),
    );
  });

  it('moves not one mark — 320.29 either way', () => {
    expect(unscoped.marksEarned).toBe(320.29);
    expect(colleges.marksEarned).toBe(320.29);
    expect(colleges.marksPossible).toBe(NAAC_TOTAL_MARKS);
    expect(marksPct(colleges.marksEarned, NAAC_TOTAL_MARKS)).toBe(35.6);
  });

  it('moves not one metric — 17 of 57 earning either way', () => {
    expect(unscoped.metricsEarning).toBe(17);
    expect(colleges.metricsEarning).toBe(17);
  });

  // The whole point of the change: the tile reconciles with the table.
  it('reports 133 evidence rows, matching the per-college table, not 150', () => {
    expect(unscoped.evidenceRows).toBe(150);
    expect(colleges.evidenceRows).toBe(133);
  });

  // 7.3.f is a facet of 7.3.1; one of its 6 rows belongs to JKKN Main Office.
  // Excluding that row must not cost 7.3.1 its marks.
  it('keeps facet credit when a facet loses a non-college row', () => {
    expect(CLUSTER_UNSCOPED['7.3.f']).toBe(6);
    expect(CLUSTER_COLLEGES_ONLY['7.3.f']).toBe(5);
    expect(colleges.byCode['7.3.1']!.marksEarned).toBe(
      unscoped.byCode['7.3.1']!.marksEarned,
    );
    expect(colleges.byCode['7.3.1']!.marksEarned).toBeGreaterThan(0);
  });
});

describe('formatting helpers', () => {
  it('trims whole marks and keeps scaled ones', () => {
    expect(formatMarks(15)).toBe('15');
    expect(formatMarks(14.7)).toBe('14.70');
    expect(formatMarks(5.88)).toBe('5.88');
    expect(formatMarks(0)).toBe('0');
  });

  it('never divides by zero', () => {
    expect(marksPct(0, 0)).toBe(0);
  });
});
