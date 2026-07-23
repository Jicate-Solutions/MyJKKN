// CARE Audit Service — data access for the CARE audit flow.
// Spec: specs/care-audit-module-spec-2026-06-12.md
//
// Every read/write goes through SECURITY DEFINER RPCs
// (supabase/migrations/20260612180000_care_audit_framework.sql) because:
//   - audit_cycles INSERT RLS requires audit.cycle.manage, but ANY staff
//     member can open a CARE audit (Director decision #2);
//   - the invited second scorer may be a LEARNER who cannot pass the audit
//     module's staff RLS — token + auth is their gate (spec §2).
// Math lives in care-scoring-service.ts (pure, vitest-covered).

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// Types (RPC payload shapes)
// ============================================================================

export interface CareSnapshotParameter {
  code: string;
  name: string;
  description: string;
  parameter_group: number;
  framework_mapping: Record<string, string>;
  evidence_required: Array<{ label: string; required: boolean }>;
}

export interface CareSnapshot {
  frozen_at: string;
  framework: 'CARE';
  version: string;
  parameters: CareSnapshotParameter[];
}

export interface CareScoreRow {
  parameter_code: string;
  scorer_role: 'owner' | 'participant';
  scorer_id: string;
  score: number;
  evidence_note: string | null;
  updated_at: string;
}

export interface CareAuditListItem {
  cycle_id: string;
  name: string;
  audience: string | null;
  phase: string;
  re_audit_date: string;
  created_at: string;
  owner_id: string;
  owner_name: string | null;
  owner_scores: Array<{ parameter_code: string; score: number }>;
  participant_submitted: boolean;
}

export interface CareAuditDetail {
  success: true;
  is_owner: boolean;
  cycle: {
    id: string;
    name: string;
    audience: string | null;
    phase: string;
    start_date: string;
    re_audit_date: string;
    owner_id: string;
    owner_name: string | null;
    created_at: string;
  };
  snapshot: CareSnapshot;
  scores: CareScoreRow[];
  invite: {
    token: string;
    invited_email: string | null;
    expires_at: string;
    accepted_by: string | null;
  } | null;
}

export interface CareInviteContext {
  success: true;
  cycle: { id: string; name: string; audience: string | null; phase: string };
  snapshot: CareSnapshot;
  my_scores: Array<{ parameter_code: string; score: number; evidence_note: string | null }>;
}

export interface CareRpcDenial {
  success: false;
  reason: string;
  detail?: string;
}

export type CareRpcResult<T> = T | CareRpcDenial;

// ============================================================================
// Service
// ============================================================================

export class CareAuditService {
  private static supabase = createClientSupabaseClient();

  /** Any staff member opens a CARE audit. Returns the new cycle id. */
  static async createAudit(input: {
    name: string;
    audience: string;
    reAuditDate: string; // YYYY-MM-DD
  }): Promise<CareRpcResult<{ success: true; cycle_id: string }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_create_audit', {
      p_name: input.name,
      p_audience: input.audience,
      p_re_audit_date: input.reAuditDate,
    });
    if (error) throw error;
    return data;
  }

  /** Own audits + every CARE audit for leadership (dashboard list). */
  static async listAudits(): Promise<CareAuditListItem[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_list_audits');
    if (error) throw error;
    return (data ?? []) as CareAuditListItem[];
  }

  /** Owner / leadership full view (cycle + snapshot + all scores + invite). */
  static async getAudit(cycleId: string): Promise<CareRpcResult<CareAuditDetail>> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_get_audit', {
      p_cycle_id: cycleId,
    });
    if (error) throw error;
    return data;
  }

  /** Owner scores one item (upsert). */
  static async upsertScore(input: {
    cycleId: string;
    parameterCode: string;
    score: number;
    evidenceNote?: string | null;
  }): Promise<CareRpcResult<{ success: true }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_upsert_score', {
      p_cycle_id: input.cycleId,
      p_parameter_code: input.parameterCode,
      p_score: input.score,
      p_evidence_note: input.evidenceNote ?? null,
    });
    if (error) throw error;
    return data;
  }

  /** Owner mints (or re-reads) the second-scorer invite link token. */
  static async createInvite(input: {
    cycleId: string;
    invitedEmail?: string;
  }): Promise<CareRpcResult<{ success: true; token: string; expires_at: string; existing: boolean }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_create_invite', {
      p_cycle_id: input.cycleId,
      p_invited_email: input.invitedEmail ?? null,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Participant opens the invite link. Token + auth is the gate (works for a
   * learner account). BLIND — never contains owner scores.
   */
  static async getInviteContext(token: string): Promise<CareRpcResult<CareInviteContext>> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_get_invite_context', {
      p_token: token,
    });
    if (error) throw error;
    return data;
  }

  /** Participant submits their 20 scores in one call. */
  static async submitParticipantScores(input: {
    token: string;
    scores: Array<{ parameter_code: string; score: number; evidence_note?: string | null }>;
  }): Promise<CareRpcResult<{ success: true; saved: number }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_care_submit_participant_scores', {
      p_token: input.token,
      p_scores: input.scores,
    });
    if (error) throw error;
    return data;
  }
}
