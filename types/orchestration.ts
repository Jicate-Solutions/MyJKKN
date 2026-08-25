// types/orchestration.ts
//
// Backs /admin/orchestration (Phase 1 of the Orchestration Console). Mirrors
// the four orchestration_* tables from
// supabase/migrations/20261003000000_orchestration_console.sql exactly.
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
