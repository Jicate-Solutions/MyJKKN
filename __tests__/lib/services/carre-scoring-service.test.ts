// =====================================================================
// CARRE Audit v2.0 — scoring math tests
// =====================================================================
// Covers spec §4 (specs/carre-v2-upgrade-spec-2026-07-05.md):
//   1. carreIndex: /100 + verdict bands (81/60/38); null until all 25.
//   2. Respect override: RS1 or RS3 <= 1 freezes scale-up regardless of index,
//      and fires EARLY (on a partial sheet, index still null).
//   3. gapRules: respect (RS1/RS3<=1), floor (<8), median (A4/R3<=1),
//      system (=1).
//   4. pillarFromCode: RS-vs-R disambiguation; CARE-* codes reject (isolation).
//   5. pillarScores / pillarRating boundaries.
// =====================================================================

import { describe, it, expect } from 'vitest';

import {
  carreIndex,
  carreVerdict,
  gapRules,
  pillarFromCode,
  pillarRating,
  pillarScores,
  respectFrozen,
  variance,
  varianceFindings,
  PILLAR_ORDER,
  type CarreScoreInput,
} from '@/lib/services/audit/carre-scoring-service';

// ---------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------

function scores(entries: Record<string, number>): CarreScoreInput[] {
  return Object.entries(entries).map(([parameter_code, score]) => ({
    parameter_code,
    score,
  }));
}

const ALL_CODES: string[] = [
  'CARRE-C1', 'CARRE-C2', 'CARRE-C3', 'CARRE-C4', 'CARRE-C5',
  'CARRE-A1', 'CARRE-A2', 'CARRE-A3', 'CARRE-A4', 'CARRE-A5',
  'CARRE-R1', 'CARRE-R2', 'CARRE-R3', 'CARRE-R4', 'CARRE-R5',
  'CARRE-RS1', 'CARRE-RS2', 'CARRE-RS3', 'CARRE-RS4', 'CARRE-RS5',
  'CARRE-E1', 'CARRE-E2', 'CARRE-E3', 'CARRE-E4', 'CARRE-E5',
];

/** All 25 items set to `v` (default 4), with optional per-code overrides. */
function fullSheet(v = 4, overrides: Record<string, number> = {}): CarreScoreInput[] {
  const map: Record<string, number> = {};
  for (const code of ALL_CODES) map[code] = v;
  Object.assign(map, overrides);
  return scores(map);
}

// ---------------------------------------------------------------------
// 1. carreIndex — all-4s → 100 / Engagement-ready / not frozen
// ---------------------------------------------------------------------

describe('carreIndex — happy path', () => {
  it('all 25 scored 4 → index 100, verdict Engagement-ready, not frozen', () => {
    const r = carreIndex(fullSheet(4));
    expect(r.index).toBe(100);
    expect(r.verdict).toBe('Engagement-ready initiative');
    expect(r.operativeVerdict).toBe('Engagement-ready initiative');
    expect(r.respectFrozen).toBe(false);
  });

  it('index is null until all 25 owner scores exist', () => {
    // 24 items scored — one short.
    const partial = fullSheet(4).slice(0, 24);
    const r = carreIndex(partial);
    expect(r.index).toBeNull();
    expect(r.verdict).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 2. Respect override — RS1=1, rest 4 → computes but frozen
// ---------------------------------------------------------------------

describe('Respect override', () => {
  it('RS1=1, rest 4 → index computes but operativeVerdict frozen + respectFrozen', () => {
    const r = carreIndex(fullSheet(4, { 'CARRE-RS1': 1 }));
    expect(r.index).toBe(97); // 24*4 + 1
    expect(r.verdict).toBe('Engagement-ready initiative'); // additive band unaffected
    expect(r.operativeVerdict).toBe('Scale-up frozen — dignity failure');
    expect(r.respectFrozen).toBe(true);

    const findings = gapRules(fullSheet(4, { 'CARRE-RS1': 1 }));
    const respect = findings.find((f) => f.rule === 'respect');
    expect(respect).toBeDefined();
    expect(respect!.severity).toBe('red');
    expect(respect!.parameter_code).toBe('CARRE-RS1');
    expect(respect!.pillar).toBe('RS');
  });

  it('RS1 partial (only RS1 scored = 0) → respectFrozen true even with index null (early fire)', () => {
    const r = carreIndex(scores({ 'CARRE-RS1': 0 }));
    expect(r.index).toBeNull();
    expect(r.respectFrozen).toBe(true);
    expect(r.operativeVerdict).toBe('Scale-up frozen — dignity failure');
  });

  it('RS3=0 on a partial sheet → frozen early with index null', () => {
    const r = carreIndex(scores({ 'CARRE-RS3': 0, 'CARRE-C1': 4 }));
    expect(r.index).toBeNull();
    expect(r.respectFrozen).toBe(true);
    expect(r.operativeVerdict).toBe('Scale-up frozen — dignity failure');
  });

  it('respectFrozen is false when RS1 and RS3 are both >= 2', () => {
    expect(respectFrozen(fullSheet(4))).toBe(false);
    expect(respectFrozen(fullSheet(4, { 'CARRE-RS1': 2, 'CARRE-RS3': 2 }))).toBe(false);
    // RS2/RS4/RS5 <= 1 do NOT freeze — only RS1 or RS3.
    expect(respectFrozen(fullSheet(4, { 'CARRE-RS2': 0, 'CARRE-RS4': 1, 'CARRE-RS5': 0 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 3. gapRules — median / floor / system
// ---------------------------------------------------------------------

describe('gapRules', () => {
  it('A4=1 → median finding on CARRE-A4', () => {
    const findings = gapRules(fullSheet(4, { 'CARRE-A4': 1 }));
    const median = findings.find((f) => f.rule === 'median' && f.parameter_code === 'CARRE-A4');
    expect(median).toBeDefined();
    expect(median!.severity).toBe('red');
  });

  it('R3=1 → median finding on CARRE-R3', () => {
    const findings = gapRules(fullSheet(4, { 'CARRE-R3': 1 }));
    expect(findings.some((f) => f.rule === 'median' && f.parameter_code === 'CARRE-R3')).toBe(true);
  });

  it('a pillar summing < 8 → floor finding attached to its lowest item', () => {
    // Clarity all 1s → total 5 (< 8). Lowest item is CARRE-C1.
    const findings = gapRules(
      fullSheet(4, {
        'CARRE-C1': 1, 'CARRE-C2': 1, 'CARRE-C3': 1, 'CARRE-C4': 1, 'CARRE-C5': 1,
      }),
    );
    const floor = findings.find((f) => f.rule === 'floor' && f.pillar === 'C');
    expect(floor).toBeDefined();
    expect(floor!.severity).toBe('red');
    expect(floor!.parameter_code).toBe('CARRE-C1');
  });

  it('any item scoring exactly 1 → system finding (yellow)', () => {
    const findings = gapRules(fullSheet(4, { 'CARRE-E2': 1 }));
    const system = findings.find((f) => f.rule === 'system' && f.parameter_code === 'CARRE-E2');
    expect(system).toBeDefined();
    expect(system!.severity).toBe('yellow');
  });

  it('all-4s sheet fires no gap rules', () => {
    expect(gapRules(fullSheet(4))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 4. pillarFromCode — RS-vs-R disambiguation + cross-framework isolation
// ---------------------------------------------------------------------

describe('pillarFromCode', () => {
  it('disambiguates the two-char RS pillar from single-char R', () => {
    expect(pillarFromCode('CARRE-RS1')).toBe('RS');
    expect(pillarFromCode('CARRE-RS3')).toBe('RS');
    expect(pillarFromCode('CARRE-R3')).toBe('R');
    expect(pillarFromCode('CARRE-R1')).toBe('R');
  });

  it('maps every pillar prefix', () => {
    expect(pillarFromCode('CARRE-C1')).toBe('C');
    expect(pillarFromCode('CARRE-A5')).toBe('A');
    expect(pillarFromCode('CARRE-E4')).toBe('E');
  });

  it('rejects CARE-* v1 codes and malformed shapes (returns null)', () => {
    expect(pillarFromCode('CARE-C1')).toBeNull(); // v1 code — framework isolation
    expect(pillarFromCode('CARRE-Z1')).toBeNull();
    expect(pillarFromCode('CARRE-RS')).toBeNull();
    expect(pillarFromCode('garbage')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 5. pillarScores / pillarRating / carreVerdict boundaries
// ---------------------------------------------------------------------

describe('pillar math + verdict bands', () => {
  it('pillarScores returns all 5 pillars with Respect present', () => {
    const ps = pillarScores(fullSheet(4));
    expect(ps.map((p) => p.pillar)).toEqual(PILLAR_ORDER);
    expect(ps.find((p) => p.pillar === 'RS')).toBeDefined();
    for (const p of ps) {
      expect(p.total).toBe(20);
      expect(p.rating).toBe('Exemplary');
    }
  });

  it('rating is null until all 5 items in a pillar are scored', () => {
    const ps = pillarScores(scores({ 'CARRE-C1': 4, 'CARRE-C2': 4 }));
    const c = ps.find((p) => p.pillar === 'C')!;
    expect(c.scoredCount).toBe(2);
    expect(c.rating).toBeNull();
  });

  it('pillarRating boundaries (17 / 13 / 8)', () => {
    expect(pillarRating(20)).toBe('Exemplary');
    expect(pillarRating(17)).toBe('Exemplary');
    expect(pillarRating(16)).toBe('Established');
    expect(pillarRating(13)).toBe('Established');
    expect(pillarRating(12)).toBe('Habit-dependent');
    expect(pillarRating(8)).toBe('Habit-dependent');
    expect(pillarRating(7)).toBe('Critical gap');
    expect(pillarRating(0)).toBe('Critical gap');
  });

  it('carreVerdict bands (81 / 60 / 38)', () => {
    expect(carreVerdict(100)).toBe('Engagement-ready initiative');
    expect(carreVerdict(81)).toBe('Engagement-ready initiative');
    expect(carreVerdict(80)).toBe('Sound core, targeted fixes needed');
    expect(carreVerdict(60)).toBe('Sound core, targeted fixes needed');
    expect(carreVerdict(59)).toBe('Redesign the weak pillars before scaling');
    expect(carreVerdict(38)).toBe('Redesign the weak pillars before scaling');
    expect(carreVerdict(37)).toBe('Do not scale; rebuild the experience layer');
    expect(carreVerdict(0)).toBe('Do not scale; rebuild the experience layer');
  });
});

// ---------------------------------------------------------------------
// 6. variance — two-scorer disagreement >= 2 → Clarity finding
// ---------------------------------------------------------------------

describe('variance', () => {
  it('flags items where both scored and |delta| >= 2', () => {
    const owner = scores({ 'CARRE-C1': 4, 'CARRE-A2': 3, 'CARRE-RS3': 4 });
    const participant = scores({ 'CARRE-C1': 1, 'CARRE-A2': 2, 'CARRE-RS3': 0 });
    const items = variance(owner, participant);
    // C1: |4-1|=3 (>=2), A2: |3-2|=1 (no), RS3: |4-0|=4 (>=2)
    expect(items.map((i) => i.parameter_code).sort()).toEqual(['CARRE-C1', 'CARRE-RS3']);
    const findings = varianceFindings(items);
    expect(findings.every((f) => f.rule === 'variance' && f.pillar === 'C')).toBe(true);
  });

  it('ignores items only one scorer scored', () => {
    const owner = scores({ 'CARRE-C1': 4 });
    const participant = scores({ 'CARRE-A1': 0 });
    expect(variance(owner, participant)).toHaveLength(0);
  });
});
