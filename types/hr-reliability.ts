// =============================================================================
// HR staff harness — duty tower and the earned-trust reliability signal
// Migration 20271007161151_hr_duty_tower_and_reliability.sql
// =============================================================================

/** The seven measurable HR duties on the loops tower. */
export const HR_TOWER_DUTY_CODES = ['L1', 'L2', 'A3', 'S2', 'S3', 'G2', 'R5'] as const;
export type HrTowerDutyCode = (typeof HR_TOWER_DUTY_CODES)[number];

/** Team-member wording for each duty, as on the loops tower rows. */
export const HR_TOWER_DUTY_NAMES: Record<HrTowerDutyCode, string> = {
  L1: "Approve or reject a team member's leave at your step",
  L2: "Decide a team member's comp-off claim before it expires",
  A3: "Decide a team member's attendance correction",
  S2: 'Verify a document a team member uploaded',
  S3: 'Review a photo a team member submitted',
  G2: 'Act on an HR form at your step',
  R5: 'Approve a candidate at your step',
};

/** loop_registry.loop_key for a duty code: 'L1' -> 'hr-duty-l1'. */
export function towerLoopKey(code: string): string {
  return `hr-duty-${code.toLowerCase()}`;
}

export type ReliabilitySignal = 'steady' | 'building' | 'too few items';

/** One row of fn_hr_my_reliability(): the caller's own 12-week record for a duty. */
export interface MyReliabilityRow {
  duty_code: string;
  items: number;
  /** 0..1, as a string or number from PostgREST numeric. */
  on_time_rate: number | string | null;
  reversal_rate: number | string | null;
  signal: ReliabilitySignal;
  /** The bar the signal was read against (platform_policies hr.harness.trust.*), NULL when unreadable. */
  min_items: number | string | null;
  steady_on_time: number | string | null;
  max_reversal: number | string | null;
}

/** One row of hr_duty_tower_readings (desk numbers, never per person). */
export interface DutyTowerReading {
  duty_code: string;
  institution_id: string | null;
  week_start: string;
  items: number;
  on_time: number;
  late: number;
  open_overdue: number;
  reversed: number;
  on_time_rate: number | string | null;
  reversal_rate: number | string | null;
}

export type TrustSuggestionStatus = 'proposed' | 'noted' | 'declined';

export interface TrustSuggestion {
  id: string;
  user_id: string;
  duty_code: string;
  /** Only "steady for N weeks": the person's own counts and rates are never stored here. */
  evidence: { steady_weeks?: number };
  status: TrustSuggestionStatus;
  created_at: string;
  person_name: string | null;
}

/** The Director's view: switch state, suggestions and per-college readings. */
export interface TrustDirectorView {
  switchOn: boolean;
  switchChangedAt: string | null;
  suggestions: TrustSuggestion[];
  weekStart: string | null;
  readings: Array<DutyTowerReading & { institution_name: string | null }>;
}

/** Numeric from PostgREST (numeric arrives as a string) as a plain number, or null. */
export function toRate(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 0.9123 -> "91%" ; null -> "—". */
export function formatRate(v: number | string | null | undefined): string {
  const n = toRate(v);
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}
