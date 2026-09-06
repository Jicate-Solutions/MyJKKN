// types/orchestration.ts
//
// Backs /admin/orchestration (Phase 1 of the Orchestration Console). Mirrors
// the four orchestration_* tables from
// supabase/migrations/20261003000001_orchestration_console.sql exactly.
// See artifacts/orchestration-console-spec.html for the full spec.

export type OrchestrationModuleStatus = 'idle' | 'working' | 'gated' | 'blocked';

export interface OrchestrationModule {
  id: string;
  key: string;
  title: string;
  module_url: string | null;
  status: OrchestrationModuleStatus;
  blocked_reason: string | null;
  blocked_impact: string | null;
  does_text: string | null;
  output_text: string | null;
  impact_text: string | null;
  updated_at: string;
}

export interface OrchestrationPr {
  id: string;
  number: number;
  module_key: string | null;
  title: string | null;
  mergeable: string | null;
  ci_state: string | null;
  ci_checked_at: string | null;
  gate_state: string | null;
  is_draft: boolean;
  /** Ship-policy tier from 20261105000000_orchestration_prs_risk_tier.sql.
   *  Optional so rows read before that migration is applied still type. */
  risk_tier?: 'HELD' | 'LOW' | 'NORMAL';
  risk_reasons?: string[];
  changed_files_count?: number | null;
  updated_at: string;
}

export type OrchestrationActionKind = 'run_ai' | 'merge' | 'deploy';
export type OrchestrationActionStatus = 'pending' | 'queued' | 'triggered' | 'succeeded' | 'failed';

export interface OrchestrationAction {
  id: string;
  kind: OrchestrationActionKind;
  target: string | null;
  actor_id: string | null;
  status: OrchestrationActionStatus | string;
  result: Record<string, unknown> | null;
  created_at: string;
}

export interface OrchestrationSessionState {
  session_id: string;
  name: string | null;
  last_seen_at: string;
  current_activity: string | null;
}

export interface OrchestrationPayload {
  modules: OrchestrationModule[];
  prs: OrchestrationPr[];
  actions: OrchestrationAction[];
  session: OrchestrationSessionState[];
}

// ----------------------------------------------------------------------------
// Computed Director signals — the self-maintaining replacement for hand-typed
// "Waiting on you" rows. Each one is a live production query, resolvable only
// by the Director (or, for 'organisational' ones, a leadership-level call
// that isn't code-enforced), carrying its own cost figure. See
// lib/services/orchestration/director-signals.ts for the nine definitions
// and artifacts/directors-board-signals.html for the survey that produced
// them (~40 candidates rejected against the three-gate rule).
// ----------------------------------------------------------------------------

/**
 * 'enforced'      — only the Director's account can act (a pinned approver
 *                    id, a named assignee) — verified against RLS/approval
 *                    logic, not just a label.
 * 'organisational' — the underlying write path is also open to admin/
 *                    super_admin generally; it's on the board as a
 *                    leadership call, not a code-enforced gate.
 */
export type DirectorSignalConfidence = 'enforced' | 'organisational';

/**
 * What is actually waiting, for the board's sort order (Director ruling,
 * 2026-08-26: "a person waiting 43 days for a job offer goes above ₹43
 * crore of overdue fees"):
 * 'people'  — a named human is blocked on the Director (a hire, a student,
 *             a grievance filer, someone awaiting a ruling).
 * 'money'   — a rupee figure is at risk/overdue, no named person waiting.
 * 'system'  — a switch, config, or organisational gap — no age, no money.
 */
export type DirectorSignalKind = 'people' | 'money' | 'system';

export interface DirectorSignal {
  id: string;
  label: string;
  /** Where the Director goes to resolve it. Null only if no working route
   *  was found for this signal (see the PR description for any parked ones). */
  resolveUrl: string | null;
  confidence: DirectorSignalConfidence;
  /** Sort tier — see DirectorSignalKind. People-waiting signals sort above
   *  money/system ones regardless of the rupee amount involved. */
  kind: DirectorSignalKind;
  active: boolean;
  /** A plain-English cost sentence built from the same query — never a
   *  fabricated number. Null when the signal is inactive. */
  cost: string | null;
  /** Oldest number of days a named person has been waiting, straight from
   *  the same query as `cost` — only populated for signals whose evaluator
   *  already computes an age (oldest/overdue days). Left undefined rather
   *  than fabricated for signals with no age to report; those fall to the
   *  end of their sort tier in registry order. */
  waitDays?: number;
  /** ISO timestamp of the evaluation run that produced this whole batch —
   *  identical across every signal in one evaluateDirectorSignals() call.
   *  Lets the board prove *when* it checked, not just that it did. */
  evaluatedAt: string;
  /** Present only when the signal's query itself failed — the panel still
   *  renders every other signal (Promise.allSettled), this just couldn't
   *  compute. Never shown as if it were a real "you're clear" result. */
  error?: string;
}
