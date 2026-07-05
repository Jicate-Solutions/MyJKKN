// CARRE Audit Service — data access for the CARRE (v2.0) audit flow.
// Spec: specs/carre-v2-upgrade-spec-2026-07-05.md
//
// Parallel to care-audit-service.ts (CARE v1.0), which is left untouched.
// Every read/write goes through the NEW fn_carre_* SECURITY DEFINER RPCs
// (supabase/migrations/20260705120000_carre_audit_v2.sql), for the same
// reasons the CARE service is RPC-only:
//   - audit_cycles INSERT RLS requires audit.cycle.manage, but ANY staff
//     member can open a CARRE audit (Director decision, inherited from CARE);
//   - the invited second scorer may be a LEARNER who cannot pass the audit
//     module's staff RLS — token + auth is their gate.
//
// PARTICIPANT PATH IS SHARED: the token-gated invite-context / submit RPCs
// shipped with CARE v1 are framework-agnostic (they resolve the cycle through
// the invite, never filtering on `frameworks`), so a CARRE second-scorer flow
// reuses them via the existing CARE participant hooks/service — no CARRE
// duplicate. That is why this service exposes create/list/get/score/invite
// only. Math lives in carre-scoring-service.ts (pure, vitest-covered).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SettingCode } from '@/lib/services/audit/carre-scoring-service';

// ============================================================================
// Types (RPC payload shapes)
// ============================================================================

export interface CarreSnapshotParameter {
  code: string; // 'CARRE-C1' … 'CARRE-E5'
  name: string;
  description: string;
  parameter_group: number;
  framework_mapping: Record<string, string>;
  /** Per-setting evidence anchors: [{ setting: 'ACAD', label: '…' }, …]. */
  evidence_required: Array<{ setting: string; label: string }>;
}

export interface CarreSnapshot {
  frozen_at: string;
  framework: 'CARRE';
  version: string;
  /** The setting this audit is scoped to — selects the evidence anchor shown. */
  setting_code: SettingCode;
  parameters: CarreSnapshotParameter[];
}

export interface CarreScoreRow {
  parameter_code: string;
  scorer_role: 'owner' | 'participant';
  scorer_id: string;
  score: number;
  evidence_note: string | null;
  updated_at: string;
}

export interface CarreAuditListItem {
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

export interface CarreAuditDetail {
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
  snapshot: CarreSnapshot;
  scores: CarreScoreRow[];
  invite: {
    token: string;
    invited_email: string | null;
    expires_at: string;
    accepted_by: string | null;
  } | null;
}

export interface CarreRpcDenial {
  success: false;
  reason: string;
  detail?: string;
}

export type CarreRpcResult<T> = T | CarreRpcDenial;

// ============================================================================
// Service
// ============================================================================

export class CarreAuditService {
  private static supabase = createClientSupabaseClient();

  /** Any staff member opens a CARRE audit (25 items + a setting code). */
  static async createAudit(input: {
    name: string;
    audience: string;
    settingCode: SettingCode;
    reAuditDate: string; // YYYY-MM-DD
  }): Promise<CarreRpcResult<{ success: true; cycle_id: string }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_create_audit', {
      p_name: input.name,
      p_audience: input.audience,
      p_setting_code: input.settingCode,
      p_re_audit_date: input.reAuditDate,
    });
    if (error) throw error;
    return data;
  }

  /** Own audits + every CARRE audit for leadership (dashboard list). */
  static async listAudits(): Promise<CarreAuditListItem[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_list_audits');
    if (error) throw error;
    return (data ?? []) as CarreAuditListItem[];
  }

  /** Owner / leadership full view (cycle + snapshot + all scores + invite). */
  static async getAudit(cycleId: string): Promise<CarreRpcResult<CarreAuditDetail>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_get_audit', {
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
  }): Promise<CarreRpcResult<{ success: true }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_upsert_score', {
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
  }): Promise<CarreRpcResult<{ success: true; token: string; expires_at: string; existing: boolean }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_create_invite', {
      p_cycle_id: input.cycleId,
      p_invited_email: input.invitedEmail ?? null,
    });
    if (error) throw error;
    return data;
  }
}
