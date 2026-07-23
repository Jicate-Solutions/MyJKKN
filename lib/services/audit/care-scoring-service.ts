// CARE Scoring Service — pure math for the JKKN CARE Audit Framework v1.0
// Spec: specs/care-audit-module-spec-2026-06-12.md §4
// Canonical framework: docs/guides/2026-06-12-GUIDE-care-audit-framework.md
//
// Everything in this file is a pure function (vitest pattern:
// pde-curriculum-service.test.ts). Data access lives in care-audit-service.ts.

// ============================================================================
// Types
// ============================================================================

export type CarePillar = 'C' | 'A' | 'R' | 'E';

export interface CareScoreInput {
  parameter_code: string; // 'CARE-C1' … 'CARE-E5'
  score: number;          // 0–4
}

export interface PillarScore {
  pillar: CarePillar;
  label: string;
  /** Sum of scored items (max 20). */
  total: number;
  /** How many of the 5 items have a score. */
  scoredCount: number;
  /** Rating band — null until all 5 items are scored. */
  rating: PillarRating | null;
}

export type PillarRating =
  | 'Exemplary'
  | 'Established'
  | 'Habit-dependent'
  | 'Critical gap';

export type CareVerdict =
  | 'Engagement-ready initiative'
  | 'Sound core, targeted fixes needed'
  | 'Redesign the weak pillars before scaling'
  | 'Do not scale; rebuild the experience layer';

export interface CareIndexResult {
  /** Sum of all 20 owner scores (max 80) — null until all 20 exist. */
  index: number | null;
  verdict: CareVerdict | null;
}

export type GapRuleKind = 'floor' | 'median' | 'system';

export interface GapRuleFinding {
  rule: GapRuleKind;
  pillar: CarePillar;
  /** The item the suggested finding attaches to. */
  parameter_code: string;
  severity: 'red' | 'yellow';
  title: string;
  note: string;
}

export interface VarianceItem {
  parameter_code: string;
  owner_score: number;
  participant_score: number;
  delta: number;
}

export interface VarianceFinding {
  rule: 'variance';
  pillar: 'C'; // variance is always a Clarity finding (framework rule 3)
  parameter_code: string;
  severity: 'yellow';
  title: string;
  note: string;
}

// ============================================================================
// Constants
// ============================================================================

export const CARE_FRAMEWORK_VERSION = '1.0';

export const PILLAR_LABELS: Record<CarePillar, string> = {
  C: 'Clarity',
  A: 'Appreciation',
  R: 'Recognition',
  E: 'Empowerment',
};

export const PILLAR_ORDER: CarePillar[] = ['C', 'A', 'R', 'E'];

/** Framework scoring-scale anchors (0–4), shown on every score button. */
export const SCORE_ANCHORS: Record<number, { label: string; hint: string }> = {
  0: { label: 'Absent', hint: 'Does not exist in any form' },
  1: { label: 'Informal', hint: 'Depends entirely on individual habit; no system' },
  2: { label: 'Partial', hint: 'In a system but inconsistent or not visible to participants' },
  3: { label: 'Systematic', hint: 'Built into the workflow, applied consistently, visible' },
  4: { label: 'Systematic + Measured', hint: 'Consistent, visible, and tracked with data someone reviews' },
};

/** Items the median rule (gap rule 2) watches. */
const MEDIAN_RULE_ITEMS = ['CARE-A4', 'CARE-R3'];

// ============================================================================
// Helpers
// ============================================================================

/** 'CARE-C1' → 'C'; unknown shapes → null (defensive, never throws). */
export function pillarFromCode(code: string): CarePillar | null {
  const m = /^CARE-([CARE])\d$/.exec(code);
  return m ? (m[1] as CarePillar) : null;
}

function toScoreMap(scores: CareScoreInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of scores) {
    if (!s || typeof s.parameter_code !== 'string') continue;
    if (typeof s.score !== 'number' || !Number.isFinite(s.score)) continue;
    if (pillarFromCode(s.parameter_code) === null) continue;
    map.set(s.parameter_code, s.score);
  }
  return map;
}

// ============================================================================
// §4.1 pillarScores — per-pillar sums (max 20)
// ============================================================================

export function pillarScores(scores: CareScoreInput[]): PillarScore[] {
  const map = toScoreMap(scores);
  return PILLAR_ORDER.map((pillar) => {
    let total = 0;
    let scoredCount = 0;
    for (let i = 1; i <= 5; i++) {
      const v = map.get(`CARE-${pillar}${i}`);
      if (v !== undefined) {
        total += v;
        scoredCount += 1;
      }
    }
    return {
      pillar,
      label: PILLAR_LABELS[pillar],
      total,
      scoredCount,
      rating: scoredCount === 5 ? pillarRating(total) : null,
    };
  });
}

/** Pillar rating bands (framework: Scoring & Interpretation). */
export function pillarRating(total: number): PillarRating {
  if (total >= 17) return 'Exemplary';
  if (total >= 13) return 'Established';
  if (total >= 8) return 'Habit-dependent';
  return 'Critical gap';
}

// ============================================================================
// §4.2 careIndex — /80 + verdict band. Owner scores are canonical.
// Index computes ONLY when all 20 owner scores exist (spec §4 empty-state).
// ============================================================================

export function careIndex(ownerScores: CareScoreInput[]): CareIndexResult {
  const map = toScoreMap(ownerScores);
  if (map.size < 20) return { index: null, verdict: null };

  let index = 0;
  for (const pillar of PILLAR_ORDER) {
    for (let i = 1; i <= 5; i++) {
      const v = map.get(`CARE-${pillar}${i}`);
      if (v === undefined) return { index: null, verdict: null };
      index += v;
    }
  }
  return { index, verdict: careVerdict(index) };
}

/** CARE Index verdict bands (framework: Scoring & Interpretation). */
export function careVerdict(index: number): CareVerdict {
  if (index >= 65) return 'Engagement-ready initiative';
  if (index >= 48) return 'Sound core, targeted fixes needed';
  if (index >= 30) return 'Redesign the weak pillars before scaling';
  return 'Do not scale; rebuild the experience layer';
}

// ============================================================================
// §4.3 gapRules — floor / median / system → suggested finding payloads.
// All rules read OWNER scores (canonical). Findings are DRAFTS the owner
// confirms in the UI — nothing here writes anywhere.
// ============================================================================

export function gapRules(ownerScores: CareScoreInput[]): GapRuleFinding[] {
  const map = toScoreMap(ownerScores);
  const pillars = pillarScores(ownerScores);
  const findings: GapRuleFinding[] = [];

  // Rule 1 — Floor: any FULLY-SCORED pillar < 8 → corrective move with an
  // owner and a date, even if the index is high.
  for (const p of pillars) {
    if (p.scoredCount === 5 && p.total < 8) {
      // attach to the pillar's lowest item (corrective-move template:
      // "Pillar: ___ · Lowest item: ___")
      let lowestCode = `CARE-${p.pillar}1`;
      let lowestScore = Infinity;
      for (let i = 1; i <= 5; i++) {
        const code = `CARE-${p.pillar}${i}`;
        const v = map.get(code);
        if (v !== undefined && v < lowestScore) {
          lowestScore = v;
          lowestCode = code;
        }
      }
      findings.push({
        rule: 'floor',
        pillar: p.pillar,
        parameter_code: lowestCode,
        severity: 'red',
        title: `Floor rule: ${p.label} at ${p.total}/20 (critical gap)`,
        note: `Pillar ${p.label} scored ${p.total}/20 (< 8). The framework's floor rule requires a corrective move with an owner and a date — a high CARE Index does not waive it. Lowest item: ${lowestCode} (${lowestScore}).`,
      });
    }
  }

  // Rule 2 — Median: A4 or R3 ≤ 1 → the initiative serves its top decile only.
  for (const code of MEDIAN_RULE_ITEMS) {
    const v = map.get(code);
    if (v !== undefined && v <= 1) {
      const pillar = pillarFromCode(code) as CarePillar;
      findings.push({
        rule: 'median',
        pillar,
        parameter_code: code,
        severity: 'red',
        title: `Median rule: ${code} at ${v} — top-decile-only risk`,
        note: `${code} scored ${v} (≤ 1): coverage/distribution does not reach the median participant. Flag for the NIRF lens — institutional outcomes are won at the median.`,
      });
    }
  }

  // Rule 4 — System: items scoring exactly 1 (informal) are higher risk than
  // 0 — a habit-dependent mechanism creates the illusion of coverage.
  for (const pillar of PILLAR_ORDER) {
    for (let i = 1; i <= 5; i++) {
      const code = `CARE-${pillar}${i}`;
      if (map.get(code) === 1) {
        findings.push({
          rule: 'system',
          pillar,
          parameter_code: code,
          severity: 'yellow',
          title: `System rule: ${code} is habit-dependent (score 1)`,
          note: `${code} scored 1 (informal — rides on individual habit). The framework treats this as higher risk than an absent system: an absent system can be built; a habit-dependent one creates the illusion of coverage.`,
        });
      }
    }
  }

  return findings;
}

// ============================================================================
// §4.4 variance — two-scorer disagreement ≥ 2 on any item → Clarity finding
// (framework gap rule 3: "the system is not legible"). Computed ONLY on
// items both scorers scored (spec §6 partial-second-scores rule).
// ============================================================================

export function variance(
  ownerScores: CareScoreInput[],
  participantScores: CareScoreInput[],
): VarianceItem[] {
  const owner = toScoreMap(ownerScores);
  const participant = toScoreMap(participantScores);
  const items: VarianceItem[] = [];

  for (const pillar of PILLAR_ORDER) {
    for (let i = 1; i <= 5; i++) {
      const code = `CARE-${pillar}${i}`;
      const o = owner.get(code);
      const p = participant.get(code);
      if (o === undefined || p === undefined) continue;
      const delta = Math.abs(o - p);
      if (delta >= 2) {
        items.push({ parameter_code: code, owner_score: o, participant_score: p, delta });
      }
    }
  }
  return items;
}

/** Variance items → suggested Clarity finding payloads (drafts, owner confirms). */
export function varianceFindings(items: VarianceItem[]): VarianceFinding[] {
  return items.map((it) => ({
    rule: 'variance',
    pillar: 'C',
    parameter_code: it.parameter_code,
    severity: 'yellow',
    title: `Variance rule: scorers differ by ${it.delta} on ${it.parameter_code}`,
    note: `Owner scored ${it.owner_score}, participant scored ${it.participant_score} (|Δ| = ${it.delta} ≥ 2) on ${it.parameter_code}. The framework treats this as a Clarity finding — the system is not legible — before debating whose score is right.`,
  }));
}
