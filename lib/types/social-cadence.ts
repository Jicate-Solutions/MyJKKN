/**
 * Department Instagram Monthly Cadence — shared types.
 *
 * The monthly cadence is the per-department, calendar-month improvement loop the
 * chair asked for: fix an objective -> snapshot a reach BASELINE (from the
 * canonical ig_monthly_audit sink) -> read the month's classified IG-comment
 * feedback (feedback_events) -> record the action taken -> wait one calendar
 * month -> re-read the next audit row and compute reach-vs-baseline -> close.
 *
 * This file is the contract between:
 *   - the data layer   (app/api/social/cadence/route.ts)          ← GET + POST
 *   - the service layer (lib/services/social/cadence-service.ts)  ← client fetch wrappers
 *   - the UI layer      (loop page cadence section + cadence-card)
 *   - the dispatcher    (app/api/cron/social-monthly-cadence/route.ts)
 *
 * Reach is ONLY ever read from ig_monthly_audit; feedback ONLY from
 * feedback_events (the buildVoice / LoopVoice shape). Nothing here re-aggregates
 * ig_post_metrics.
 */

import type { LoopVoice } from '@/lib/types/social-loop';

/** Lifecycle of one dept-month cadence cycle. */
export type CadenceStatus = 'open' | 'awaiting_close' | 'closed' | 'unmeasurable';

/** One row of social_monthly_cadence (snapshots from the canonical readers). */
export interface MonthlyCadence {
  id: string;
  institution_id: string;
  account_id: string;
  department_id: string | null;
  /** First-of-month DATE (YYYY-MM-DD), aligned to ig_monthly_audit.audit_month. */
  cadence_month: string;
  objective: string;
  baseline_reach: number | null;
  baseline_month: string | null;
  baseline_metrics_source: string | null;
  /** LoopVoice snapshot captured when the action was recorded. */
  feedback_read_summary: LoopVoice | null;
  action_taken: string | null;
  remeasure_reach: number | null;
  remeasure_month: string | null;
  remeasure_metrics_source: string | null;
  reach_delta: number | null;
  status: CadenceStatus;
  /**
   * REQUIRED link to the unified-OKR objective — a real `projects` row
   * (is_okr=true, project_type='okr_objective', owner=HOD). Its rag_status
   * carries the reach-vs-target teeth for the dormant project_at_risk rule.
   */
  project_id: string;
  learning: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The monthly reach row read from ig_monthly_audit via fn_ig_monthly_reach. */
export interface MonthlyReach {
  audit_month: string;
  total_reach: number;
  total_impressions: number;
  total_comments: number;
  total_saves: number;
  total_shares: number;
  health_score: number | null;
  /** ig_accounts.metrics_source: 'graph' = reach readable / 'business_discovery' = reach 0. */
  metrics_source: string | null;
}

/** The account a cadence view is scoped to. */
export interface CadenceAccount {
  id: string;
  username: string | null;
  metrics_source: string | null;
}

/** GET /api/social/cadence response. */
export interface CadenceListResponse {
  success: boolean;
  cadences?: MonthlyCadence[];
  account?: CadenceAccount;
  /** Current-month reach snapshot (baseline candidate) — null when no audit row yet. */
  currentReach?: MonthlyReach | null;
  /** metrics_source === 'graph' — reach is measurable for this handle. */
  readable?: boolean;
  /** social.cadence.enabled policy — the engine is DARK when false. */
  enabled?: boolean;
  error?: string;
}

/** POST op discriminator. */
export type CadenceOp = 'open' | 'action' | 'close';

/** POST /api/social/cadence body (one of three ops). */
export interface OpenCadenceBody {
  op: 'open';
  /** uuid OR username; defaults to jkknpharmacy server-side. */
  accountId?: string;
  objective: string;
  /** First-of-month DATE; defaults to the current month server-side. */
  cadenceMonth?: string;
  // NOTE: no projectId — open ALWAYS auto-creates the cadence's own is_okr
  // objective server-side (round-3 HIGH root fix; the caller-supplied project
  // link was a cross-tenant RAG-hijack vector and was removed).
}

export interface RecordActionBody {
  op: 'action';
  cadenceId: string;
  action: string;
  /** LoopVoice snapshot to store as feedback_read_summary. */
  feedbackSummary?: LoopVoice | null;
}

export interface CloseCadenceBody {
  op: 'close';
  cadenceId: string;
  learning: string;
}

export type CadenceMutationBody = OpenCadenceBody | RecordActionBody | CloseCadenceBody;

/** POST /api/social/cadence response. */
export interface CadenceMutationResponse {
  success: boolean;
  cadence?: MonthlyCadence;
  error?: string;
}
