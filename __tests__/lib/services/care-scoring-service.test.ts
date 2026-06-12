// =====================================================================
// CARE Audit — scoring math tests
// =====================================================================
// Covers (spec §4 + §6):
//   1. pillarScores: sums, partial counts, ratings only when complete.
//   2. careIndex: /80 + verdict bands; null until all 20 owner scores.
//   3. gapRules: floor (<8), median (A4/R3 ≤1), system (=1) boundaries.
//   4. variance: |Δ| ≥ 2 on both-scored items only → Clarity findings.
//   5. ACCEPTANCE FIXTURE — the PDE demonstrations audit (2026-06-12,
//      docs/modules/pde/2026-06-12-AUDIT-care-pde-demonstrations.md):
//      re-entered scores must reproduce index 34/80, the Appreciation
//      floor (A=5), the A4/R3 median rule, and the 5 system-rule items.
// =====================================================================

import { describe, it, expect } from 'vitest';

import {
  careIndex,
  careVerdict,
  gapRules,
  pillarFromCode,
  pillarRating,
  pillarScores,
  variance,
  varianceFindings,
  type CareScoreInput,
} from '@/lib/services/audit/care-scoring-service';

// ---------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------

function scores(entries: Record<string, number>): CareScoreInput[] {
  return Object.entries(entries).map(([parameter_code, score]) => ({
    parameter_code,
    score,
  }));
}

/** The PDE demonstrations audit, scored 2026-06-12 (CARE Index 34/80). */
const PDE_AUDIT: Record<string, number> = {
  'CARE-C1': 3, 'CARE-C2': 2, 'CARE-C3': 2, 'CARE-C4': 1, 'CARE-C5': 2, // C = 10
  'CARE-A1': 2, 'CARE-A2': 2, 'CARE-A3': 1, 'CARE-A4': 0, 'CARE-A5': 0, // A = 5
  'CARE-R1': 2, 'CARE-R2': 2, 'CARE-R3': 0, 'CARE-R4': 1, 'CARE-R5': 3, // R = 8
  'CARE-E1': 3, 'CARE-E2': 3, 'CARE-E3': 3, 'CARE-E4': 1, 'CARE-E5': 1, // E = 11
};

// ---------------------------------------------------------------------
// pillarFromCode
// ---------------------------------------------------------------------

describe('pillarFromCode', () => {
  it('extracts the pillar letter from valid codes', () => {
    expect(pillarFromCode('CARE-C1')).toBe('C');
    expect(pillarFromCode('CARE-A4')).toBe('A');
    expect(pillarFromCode('CARE-R3')).toBe('R');
    expect(pillarFromCode('CARE-E5')).toBe('E');
  });

  it('returns null for non-CARE or malformed codes', () => {
    expect(pillarFromCode('G1-P01-curriculum')).toBeNull();
    expect(pillarFromCode('CARE-X1')).toBeNull();
    expect(pillarFromCode('CARE-C')).toBeNull();
    expect(pillarFromCode('')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// pillarScores
// ---------------------------------------------------------------------

describe('pillarScores', () => {
  it('sums each pillar and counts scored items', () => {
    const result = pillarScores(scores(PDE_AUDIT));
    const byPillar = Object.fromEntries(result.map((p) => [p.pillar, p]));
    expect(byPillar.C.total).toBe(10);
    expect(byPillar.A.total).toBe(5);
    expect(byPillar.R.total).toBe(8);
    expect(byPillar.E.total).toBe(11);
    expect(result.every((p) => p.scoredCount === 5)).toBe(true);
  });

  it('keeps rating null until all 5 items of a pillar are scored', () => {
    const partial = scores({ 'CARE-C1': 4, 'CARE-C2': 4 });
    const c = pillarScores(partial).find((p) => p.pillar === 'C')!;
    expect(c.total).toBe(8);
    expect(c.scoredCount).toBe(2);
    expect(c.rating).toBeNull();
  });

  it('ignores non-CARE codes and malformed entries', () => {
    const mixed = [
      ...scores({ 'CARE-C1': 3 }),
      { parameter_code: 'G1-P01-curriculum', score: 4 },
      { parameter_code: 'CARE-C2', score: Number.NaN },
    ] as CareScoreInput[];
    const c = pillarScores(mixed).find((p) => p.pillar === 'C')!;
    expect(c.total).toBe(3);
    expect(c.scoredCount).toBe(1);
  });

  it('returns all four pillars at zero for empty input', () => {
    const result = pillarScores([]);
    expect(result).toHaveLength(4);
    expect(result.every((p) => p.total === 0 && p.scoredCount === 0 && p.rating === null)).toBe(true);
  });
});

describe('pillarRating bands', () => {
  it('matches the framework boundaries', () => {
    expect(pillarRating(20)).toBe('Exemplary');
    expect(pillarRating(17)).toBe('Exemplary');
    expect(pillarRating(16)).toBe('Established');
    expect(pillarRating(13)).toBe('Established');
    expect(pillarRating(12)).toBe('Habit-dependent');
    expect(pillarRating(8)).toBe('Habit-dependent');
    expect(pillarRating(7)).toBe('Critical gap');
    expect(pillarRating(0)).toBe('Critical gap');
  });
});

// ---------------------------------------------------------------------
// careIndex
// ---------------------------------------------------------------------

describe('careIndex', () => {
  it('is null until all 20 owner scores exist (spec §4 empty-state)', () => {
    expect(careIndex([]).index).toBeNull();
    const nineteen = { ...PDE_AUDIT };
    delete (nineteen as Record<string, number>)['CARE-E5'];
    expect(careIndex(scores(nineteen)).index).toBeNull();
    expect(careIndex(scores(nineteen)).verdict).toBeNull();
  });

  it('matches the framework verdict boundaries', () => {
    expect(careVerdict(80)).toBe('Engagement-ready initiative');
    expect(careVerdict(65)).toBe('Engagement-ready initiative');
    expect(careVerdict(64)).toBe('Sound core, targeted fixes needed');
    expect(careVerdict(48)).toBe('Sound core, targeted fixes needed');
    expect(careVerdict(47)).toBe('Redesign the weak pillars before scaling');
    expect(careVerdict(30)).toBe('Redesign the weak pillars before scaling');
    expect(careVerdict(29)).toBe('Do not scale; rebuild the experience layer');
    expect(careVerdict(0)).toBe('Do not scale; rebuild the experience layer');
  });
});

// ---------------------------------------------------------------------
// gapRules — boundaries
// ---------------------------------------------------------------------

describe('gapRules boundaries', () => {
  it('floor rule fires below 8, not at exactly 8', () => {
    // A pillar at exactly 8 (R in the PDE fixture) must NOT fire the floor.
    const all2s: Record<string, number> = {};
    for (const p of ['C', 'A', 'R', 'E']) {
      for (let i = 1; i <= 5; i++) all2s[`CARE-${p}${i}`] = 2; // pillar = 10
    }
    // Drag Appreciation to exactly 8: 2+2+2+1+1
    all2s['CARE-A4'] = 1;
    all2s['CARE-A5'] = 1;
    const at8 = gapRules(scores(all2s)).filter((f) => f.rule === 'floor');
    expect(at8).toHaveLength(0);

    // One point lower → fires
    all2s['CARE-A5'] = 0;
    const at7 = gapRules(scores(all2s)).filter((f) => f.rule === 'floor');
    expect(at7).toHaveLength(1);
    expect(at7[0].pillar).toBe('A');
    expect(at7[0].severity).toBe('red');
  });

  it('floor rule waits for a fully-scored pillar (no false alarms mid-entry)', () => {
    // Only 2 Appreciation items scored, sum 1 — not a verdict yet.
    const partial = scores({ 'CARE-A1': 1, 'CARE-A2': 0 });
    expect(gapRules(partial).filter((f) => f.rule === 'floor')).toHaveLength(0);
  });

  it('median rule fires at ≤1 on A4/R3 only', () => {
    const entries = scores({ 'CARE-A4': 1, 'CARE-R3': 2, 'CARE-C4': 0 });
    const median = gapRules(entries).filter((f) => f.rule === 'median');
    expect(median).toHaveLength(1);
    expect(median[0].parameter_code).toBe('CARE-A4');
  });

  it('system rule flags exactly score 1, not 0 or 2', () => {
    const entries = scores({ 'CARE-C1': 1, 'CARE-C2': 0, 'CARE-C3': 2 });
    const system = gapRules(entries).filter((f) => f.rule === 'system');
    expect(system.map((f) => f.parameter_code)).toEqual(['CARE-C1']);
    expect(system[0].severity).toBe('yellow');
  });
});

// ---------------------------------------------------------------------
// variance
// ---------------------------------------------------------------------

describe('variance', () => {
  it('fires at |Δ| ≥ 2, not at 1', () => {
    const owner = scores({ 'CARE-C1': 3, 'CARE-C2': 3 });
    const participant = scores({ 'CARE-C1': 1, 'CARE-C2': 2 });
    const items = variance(owner, participant);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      parameter_code: 'CARE-C1',
      owner_score: 3,
      participant_score: 1,
      delta: 2,
    });
  });

  it('computes only on items both scorers scored (spec §6 partial rule)', () => {
    const owner = scores({ 'CARE-C1': 4, 'CARE-C2': 4 });
    const participant = scores({ 'CARE-C2': 4 }); // C1 unscored by participant
    expect(variance(owner, participant)).toHaveLength(0);
  });

  it('maps variance items to Clarity finding drafts', () => {
    const findings = varianceFindings([
      { parameter_code: 'CARE-E4', owner_score: 4, participant_score: 0, delta: 4 },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].pillar).toBe('C'); // always Clarity (framework rule 3)
    expect(findings[0].severity).toBe('yellow');
    expect(findings[0].note).toContain('|Δ| = 4');
  });
});

// ---------------------------------------------------------------------
// ACCEPTANCE FIXTURE — PDE demonstrations audit, 34/80
// ---------------------------------------------------------------------

describe('ACCEPTANCE: PDE demonstrations audit (2026-06-12)', () => {
  const entries = scores(PDE_AUDIT);

  it('reproduces the CARE Index 34/80 and its verdict band', () => {
    const result = careIndex(entries);
    expect(result.index).toBe(34);
    expect(result.verdict).toBe('Redesign the weak pillars before scaling');
  });

  it('reproduces pillar scores and ratings from the audit doc', () => {
    const byPillar = Object.fromEntries(pillarScores(entries).map((p) => [p.pillar, p]));
    expect(byPillar.C).toMatchObject({ total: 10, rating: 'Habit-dependent' });
    expect(byPillar.A).toMatchObject({ total: 5, rating: 'Critical gap' });
    expect(byPillar.R).toMatchObject({ total: 8, rating: 'Habit-dependent' });
    expect(byPillar.E).toMatchObject({ total: 11, rating: 'Habit-dependent' });
  });

  it('fires the Appreciation floor rule (A = 5 < 8) and no other floor', () => {
    const floors = gapRules(entries).filter((f) => f.rule === 'floor');
    expect(floors).toHaveLength(1);
    expect(floors[0].pillar).toBe('A');
    // Lowest-item attachment: A4 and A5 are both 0; first lowest wins (A4).
    expect(floors[0].parameter_code).toBe('CARE-A4');
  });

  it('fires the median rule on BOTH A4 (0) and R3 (0)', () => {
    const medians = gapRules(entries).filter((f) => f.rule === 'median');
    expect(medians.map((f) => f.parameter_code).sort()).toEqual(['CARE-A4', 'CARE-R3']);
  });

  it('flags the five system-rule items at score 1 (C4, A3, R4, E4, E5)', () => {
    const system = gapRules(entries).filter((f) => f.rule === 'system');
    expect(system.map((f) => f.parameter_code).sort()).toEqual([
      'CARE-A3', 'CARE-C4', 'CARE-E4', 'CARE-E5', 'CARE-R4',
    ]);
  });
});
