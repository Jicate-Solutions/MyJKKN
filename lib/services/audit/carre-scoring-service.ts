// CARRE Scoring Service — pure math for the JKKN CARRE Audit Framework v2.0
// Framework: JKKN-CARRE-Audit-Framework.md (July 2026)
// Spec: specs/carre-v2-upgrade-spec-2026-07-05.md
//
// Parallel to care-scoring-service.ts (CARE v1.0), which is left untouched.
// Adds the Respect pillar (RS1..RS5), the /100 index, the v2.0 verdict bands,
// and the Respect override. Every function here is pure (vitest pattern). Data
// access lives in carre-audit-service.ts.

// ============================================================================
// Types
// ============================================================================

export type CarrePillar = 'C' | 'A' | 'R' | 'RS' | 'E';

export interface CarreScoreInput {
  parameter_code: string; // 'CARRE-C1' … 'CARRE-E5'
  score: number;          // 0–4
}

export type PillarRating =
  | 'Exemplary'
  | 'Established'
  | 'Habit-dependent'
  | 'Critical gap';

export type CarreVerdict =
  | 'Engagement-ready initiative'
  | 'Sound core, targeted fixes needed'
  | 'Redesign the weak pillars before scaling'
  | 'Do not scale; rebuild the experience layer';

/** The operative verdict can be forced by the Respect override regardless of index. */
export type OperativeVerdict = CarreVerdict | 'Scale-up frozen — dignity failure';

export interface PillarScore {
  pillar: CarrePillar;
  label: string;
  /** Sum of scored items (max 20). */
  total: number;
  /** How many of the 5 items have a score. */
  scoredCount: number;
  /** Rating band — null until all 5 items are scored. */
  rating: PillarRating | null;
}

export interface CarreIndexResult {
  /** /100, null until all 25 owner scores exist. */
  index: number | null;
  /** Additive band (framework verdict table) — null until index computes. */
  verdict: CarreVerdict | null;
  /** Band after the Respect override supersedes the additive band. */
  operativeVerdict: OperativeVerdict | null;
  /** RS1 or RS3 <= 1. */
  respectFrozen: boolean;
}

export type GapRuleKind = 'floor' | 'median' | 'system' | 'respect';

export interface GapRuleFinding {
  rule: GapRuleKind;
  pillar: CarrePillar;
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
  pillar: 'C'; // variance is always a Clarity finding (framework gap rule 3)
  parameter_code: string;
  severity: 'yellow';
  title: string;
  note: string;
}

// ============================================================================
// Constants
// ============================================================================

export const CARRE_FRAMEWORK_VERSION = '2.0';

export const PILLAR_LABELS: Record<CarrePillar, string> = {
  C: 'Clarity',
  A: 'Appreciation',
  R: 'Recognition',
  RS: 'Respect',
  E: 'Empowerment',
};

export const PILLAR_ORDER: CarrePillar[] = ['C', 'A', 'R', 'RS', 'E'];

/** Item suffixes per pillar (Respect uses RS1..RS5). */
const PILLAR_ITEMS: Record<CarrePillar, string[]> = {
  C:  ['C1', 'C2', 'C3', 'C4', 'C5'],
  A:  ['A1', 'A2', 'A3', 'A4', 'A5'],
  R:  ['R1', 'R2', 'R3', 'R4', 'R5'],
  RS: ['RS1', 'RS2', 'RS3', 'RS4', 'RS5'],
  E:  ['E1', 'E2', 'E3', 'E4', 'E5'],
};

/** Framework scoring-scale anchors (0–4), shown on every score button. */
export const SCORE_ANCHORS: Record<number, { label: string; hint: string }> = {
  0: { label: 'Absent', hint: 'Does not exist in any form' },
  1: { label: 'Informal', hint: 'Depends entirely on individual habit; no system' },
  2: { label: 'Partial', hint: 'In a system but inconsistent or not visible to participants' },
  3: { label: 'Systematic', hint: 'Built into the workflow, applied consistently, visible' },
  4: { label: 'Systematic + Measured', hint: 'Consistent, visible, tracked with data someone reviews' },
};

/** The four evidence-anchor settings a CARRE audit can be scoped to. */
export const SETTING_CODES = ['ACAD', 'CLIN', 'ADMIN', 'EVENT'] as const;
export type SettingCode = (typeof SETTING_CODES)[number];

export const SETTING_LABELS: Record<SettingCode, string> = {
  ACAD: 'Academic',
  CLIN: 'Clinical',
  ADMIN: 'Administrative',
  EVENT: 'Event',
};

/** Items the median rule (gap rule 2) watches. */
const MEDIAN_RULE_ITEMS = ['CARRE-A4', 'CARRE-R3'];
/** Items the Respect override (gap rule 5) watches. */
const RESPECT_OVERRIDE_ITEMS = ['CARRE-RS1', 'CARRE-RS3'];

// ============================================================================
// Helpers
// ============================================================================

/**
 * 'CARRE-RS1' -> 'RS', 'CARRE-R3' -> 'R'. The two-char RS is matched before R
 * (alternation order matters — a greedy left-to-right match would otherwise
 * capture R and leave S1). Unknown shapes -> null (defensive, never throws).
 */
export function pillarFromCode(code: string): CarrePillar | null {
  const m = /^CARRE-(RS|C|A|R|E)(\d)$/.exec(code);
  return m ? (m[1] as CarrePillar) : null;
}

// ============================================================================
// Classroom Practice — the 13-item per-Senior-Learner catalog.
//
// Same 0–4 scale and same pillars as CARRE, but a DIFFERENT instrument: it
// scores one person's own practice rather than an initiative. Deliberately has
// NO /100 index and no doctrine caps — a 13-item sheet with uneven pillar sizes
// cannot produce a comparable index, and an index invites ranking people, which
// this instrument must never do. Per-pillar MEDIANS (0–4) are what it reports.
//
// Recognition (R) has no items: recognition surfaces are institutional, not
// something one person controls inside their own sessions.
// ============================================================================

export const CLASSROOM_PRACTICE_ITEM_COUNT = 13;

/**
 * Classroom Practice scores FREQUENCY, not maturity.
 *
 * The 25-item CARRE sheet asks how developed a system is (absent → measured),
 * which fits an initiative. A 13-item sheet about one person's own practice asks
 * how OFTEN something happens, and — decisively — the learner drip asks its
 * single micro-question on the same never→always scale. Both sides of the
 * self-vs-learner compare have to be answering the same question, or the gap
 * between them measures nothing.
 *
 * 4 is "always, and there is evidence of it" — the ratified top anchor.
 */
export const CLASSROOM_SCORE_ANCHORS: Record<number, { label: string; hint: string }> = {
  0: { label: 'Never', hint: 'Does not happen' },
  1: { label: 'Rarely', hint: 'Happens once in a while; nobody could rely on it' },
  2: { label: 'Sometimes', hint: 'Happens about half the time' },
  3: { label: 'Usually', hint: 'Happens most of the time' },
  4: { label: 'Always', hint: 'Happens every time — and there is evidence of it' },
};

/** Pillars the Classroom Practice catalog actually uses, in display order. */
export const CLASSROOM_PILLAR_ORDER: CarrePillar[] = ['C', 'A', 'RS', 'E'];

/** 'CP-RS3' -> 'RS'. Two-char RS matched before R (alternation order matters). */
export function classroomPillarFromCode(code: string): CarrePillar | null {
  const m = /^CP-(RS|C|A|R|E)(\d)$/.exec(code);
  return m ? (m[1] as CarrePillar) : null;
}

/** True when a frozen snapshot is a Classroom Practice cycle. */
export function isClassroomCatalog(
  snapshot: { catalog?: string | null } | null | undefined,
): boolean {
  return snapshot?.catalog === 'CLASSROOM_PRACTICE';
}

export interface ClassroomPillarScore {
  pillar: CarrePillar;
  label: string;
  /** Median of the scored items (0–4); null until at least one is scored. */
  median: number | null;
  scoredCount: number;
  itemCount: number;
}

/** Median of a numeric list; null when empty. Even counts average the middle two. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Per-pillar medians for a Classroom Practice sheet. Driven by the cycle's
 * frozen parameter codes rather than a hardcoded item list, so a future catalog
 * revision reports correctly without touching this function.
 */
export function classroomPillarScores(
  parameterCodes: string[],
  scores: CarreScoreInput[],
): ClassroomPillarScore[] {
  const scoreByCode = new Map<string, number>();
  for (const s of scores) {
    if (!s || typeof s.parameter_code !== 'string') continue;
    if (typeof s.score !== 'number' || !Number.isFinite(s.score)) continue;
    if (classroomPillarFromCode(s.parameter_code) === null) continue;
    scoreByCode.set(s.parameter_code, s.score);
  }

  return CLASSROOM_PILLAR_ORDER.map((pillar) => {
    const codes = parameterCodes.filter((c) => classroomPillarFromCode(c) === pillar);
    const scored = codes
      .map((c) => scoreByCode.get(c))
      .filter((v): v is number => v !== undefined);
    return {
      pillar,
      label: PILLAR_LABELS[pillar],
      median: median(scored),
      scoredCount: scored.length,
      itemCount: codes.length,
    };
  }).filter((p) => p.itemCount > 0);
}

function toScoreMap(scores: CarreScoreInput[]): Map<string, number> {
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
// Per-pillar sums (max 20)
// ============================================================================

export function pillarRating(total: number): PillarRating {
  if (total >= 17) return 'Exemplary';
  if (total >= 13) return 'Established';
  if (total >= 8) return 'Habit-dependent';
  return 'Critical gap';
}

export function pillarScores(scores: CarreScoreInput[]): PillarScore[] {
  const map = toScoreMap(scores);
  return PILLAR_ORDER.map((pillar) => {
    let total = 0;
    let scoredCount = 0;
    for (const suffix of PILLAR_ITEMS[pillar]) {
      const v = map.get(`CARRE-${suffix}`);
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

// ============================================================================
// /100 index + verdict bands + Respect override
// ============================================================================

/** Additive /100 verdict bands (framework: CARRE Index table). */
export function carreVerdict(index: number): CarreVerdict {
  if (index >= 81) return 'Engagement-ready initiative';
  if (index >= 60) return 'Sound core, targeted fixes needed';
  if (index >= 38) return 'Redesign the weak pillars before scaling';
  return 'Do not scale; rebuild the experience layer';
}

/** True when RS1 or RS3 <= 1 — the Respect override (gap rule 5). */
export function respectFrozen(ownerScores: CarreScoreInput[]): boolean {
  const map = toScoreMap(ownerScores);
  return RESPECT_OVERRIDE_ITEMS.some((code) => {
    const v = map.get(code);
    return v !== undefined && v <= 1;
  });
}

export function carreIndex(ownerScores: CarreScoreInput[]): CarreIndexResult {
  const map = toScoreMap(ownerScores);
  const frozen = respectFrozen(ownerScores);

  if (map.size < 25) {
    // The Respect override can fire before the full sheet is done — surface it early.
    return {
      index: null,
      verdict: null,
      operativeVerdict: frozen ? 'Scale-up frozen — dignity failure' : null,
      respectFrozen: frozen,
    };
  }

  let index = 0;
  for (const pillar of PILLAR_ORDER) {
    for (const suffix of PILLAR_ITEMS[pillar]) {
      const v = map.get(`CARRE-${suffix}`);
      if (v === undefined) {
        return {
          index: null,
          verdict: null,
          operativeVerdict: frozen ? 'Scale-up frozen — dignity failure' : null,
          respectFrozen: frozen,
        };
      }
      index += v;
    }
  }

  const verdict = carreVerdict(index);
  return {
    index,
    verdict,
    operativeVerdict: frozen ? 'Scale-up frozen — dignity failure' : verdict,
    respectFrozen: frozen,
  };
}

// ============================================================================
// Gap rules — floor / median / system / respect → suggested finding drafts.
// All rules read OWNER scores (canonical). Findings are DRAFTS the owner
// confirms in the UI — nothing here writes anywhere.
// ============================================================================

export function gapRules(ownerScores: CarreScoreInput[]): GapRuleFinding[] {
  const map = toScoreMap(ownerScores);
  const pillars = pillarScores(ownerScores);
  const findings: GapRuleFinding[] = [];

  // Rule 5 — Respect override (highest severity; can fire on a partial sheet).
  for (const code of RESPECT_OVERRIDE_ITEMS) {
    const v = map.get(code);
    if (v !== undefined && v <= 1) {
      findings.push({
        rule: 'respect',
        pillar: 'RS',
        parameter_code: code,
        severity: 'red',
        title: `Respect override: ${code} at ${v} — scale-up frozen`,
        note: `${code} scored ${v} (<= 1). The framework freezes scale-up regardless of the Index: dignity failures compound silently — participants stop reporting (RS2 collapses), then disengage. Correct before any expansion.`,
      });
    }
  }

  // Rule 1 — Floor: any fully-scored pillar < 8.
  for (const p of pillars) {
    if (p.scoredCount === 5 && p.total < 8) {
      let lowestCode = `CARRE-${PILLAR_ITEMS[p.pillar][0]}`;
      let lowestScore = Infinity;
      for (const suffix of PILLAR_ITEMS[p.pillar]) {
        const v = map.get(`CARRE-${suffix}`);
        if (v !== undefined && v < lowestScore) {
          lowestScore = v;
          lowestCode = `CARRE-${suffix}`;
        }
      }
      findings.push({
        rule: 'floor',
        pillar: p.pillar,
        parameter_code: lowestCode,
        severity: 'red',
        title: `Floor rule: ${p.label} at ${p.total}/20 (critical gap)`,
        note: `Pillar ${p.label} scored ${p.total}/20 (< 8). Requires a corrective move with an owner and a date — a high Index does not waive it. Lowest item: ${lowestCode} (${lowestScore}).`,
      });
    }
  }

  // Rule 2 — Median: A4 or R3 <= 1.
  for (const code of MEDIAN_RULE_ITEMS) {
    const v = map.get(code);
    if (v !== undefined && v <= 1) {
      const pillar = pillarFromCode(code) as CarrePillar;
      findings.push({
        rule: 'median',
        pillar,
        parameter_code: code,
        severity: 'red',
        title: `Median rule: ${code} at ${v} — top-decile-only risk`,
        note: `${code} scored ${v} (<= 1): coverage does not reach the median participant. Flag for the NIRF lens — institutional outcomes are won at the median.`,
      });
    }
  }

  // Rule 4 — System: any item scoring exactly 1 (habit-dependent > absent).
  for (const pillar of PILLAR_ORDER) {
    for (const suffix of PILLAR_ITEMS[pillar]) {
      const code = `CARRE-${suffix}`;
      if (map.get(code) === 1) {
        findings.push({
          rule: 'system',
          pillar,
          parameter_code: code,
          severity: 'yellow',
          title: `System rule: ${code} is habit-dependent (score 1)`,
          note: `${code} scored 1 (informal — rides on individual habit). Higher risk than absent: an absent system can be built; a habit-dependent one creates the illusion of coverage.`,
        });
      }
    }
  }

  return findings;
}

// ============================================================================
// Variance — two-scorer disagreement >= 2 on any item → Clarity finding
// (framework gap rule 3: "the system is not legible"). Computed ONLY on items
// both scorers scored. Identical in shape to the v1 module, 5-pillar loop.
// ============================================================================

export function variance(
  ownerScores: CarreScoreInput[],
  participantScores: CarreScoreInput[],
): VarianceItem[] {
  const owner = toScoreMap(ownerScores);
  const participant = toScoreMap(participantScores);
  const items: VarianceItem[] = [];

  for (const pillar of PILLAR_ORDER) {
    for (const suffix of PILLAR_ITEMS[pillar]) {
      const code = `CARRE-${suffix}`;
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
    note: `Owner scored ${it.owner_score}, participant scored ${it.participant_score} (|Δ| = ${it.delta} >= 2) on ${it.parameter_code}. The framework treats this as a Clarity finding — the system is not legible — before debating whose score is right.`,
  }));
}
