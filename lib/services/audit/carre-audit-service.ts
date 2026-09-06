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
  /**
   * Which catalog was frozen. Absent on a standard 25-item CARRE cycle;
   * 'CLASSROOM_PRACTICE' on a 13-item per-Senior-Learner cycle, which renders a
   * different sheet (per-pillar medians, no /100 index, sealed compare card).
   */
  catalog?: 'CLASSROOM_PRACTICE' | null;
  /** Classroom Practice only: profiles.id of the person whose practice this is. */
  teacher_profile_id?: string | null;
  /**
   * Classroom Practice only: the address the SCF drip attributes answers by,
   * resolved from profiles.email and FROZEN at cycle creation — a later profile
   * email change cannot re-point a running cycle at someone else's voices.
   */
  teacher_email?: string | null;
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

/**
 * One row of the Classroom Practice owner picker. `sessions_90d` counts the
 * session-feedback rows attributable to this person in the last 90 days — the
 * exhaust the roster gate reads. Zero means no learner could be admitted to
 * their sheet yet, which the form warns about rather than discovering later.
 */
/**
 * One item of the owner-side compare. `learner_median` is null whenever
 * `voices` is below the k-floor of 3 — the count is still reported so the owner
 * can see answers are accumulating without any single one being identifiable.
 */
export interface ClassroomCompareItem {
  code: string;
  self_score: number | null;
  voices: number;
  learner_median: number | null;
}

export type ClassroomCompareResult =
  | {
      locked: true;
      reason:
        | 'self_score_incomplete'
        | 'forbidden'
        | 'not_found'
        | 'not_authenticated';
      item_count?: number;
      self_scored?: number;
      /** 'week' | 'month' — named even while locked so the gate copy is honest. */
      window_unit?: 'week' | 'month';
    }
  | {
      locked: false;
      item_count: number;
      self_scored: number;
      /** Impressions offered on or after this instant are held back. */
      week_cutoff: string;
      /** Same instant, honestly named: the config-driven batch-reveal cutoff. */
      window_cutoff?: string;
      /** 'week' | 'month' — Director default (2026-07-30): weekly for classes
       *  of >= 20 distinct learners, monthly below; platform_policies
       *  classroom_practice.reveal changes it with no deploy. */
      window_unit?: 'week' | 'month';
      window_learners?: number;
      items: ClassroomCompareItem[];
    };

/** One sealed learner comment, batch-revealed to Principal & Director only.
 *  Carries NO identity and no timestamp finer than the window label. */
export interface ClassroomSealedComment {
  window_label: string;
  code: string;
  comment: string;
}

export type ClassroomSealedCommentsResult =
  | {
      locked: true;
      reason:
        | 'owner_never_reads_comments'
        | 'principal_or_director_only'
        | 'forbidden'
        | 'not_found'
        | 'not_authenticated'
        | 'unavailable';
    }
  | {
      locked: false;
      window_unit: 'week' | 'month';
      window_cutoff: string;
      comments: ClassroomSealedComment[];
    };

export interface CarreTeacherOption {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  sessions_90d: number;
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

  /**
   * Is the caller the lead auditor of this CARRE cycle? Cheap EXISTS check used
   * by the audit module's page guard to admit a cycle's own owner, who is
   * authorized by every fn_carre_* RPC but need hold no audit.cycle.view.
   * Never throws on a denial — a false answer simply means "not the owner".
   */
  static async isCycleOwner(cycleId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_is_cycle_owner', {
      p_cycle_id: cycleId,
    });
    if (error) return false;
    return data === true;
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

  /**
   * Opens a 13-item Classroom Practice cycle (the per-Senior-Learner catalog).
   * `teacherId` omitted = open one on yourself; naming someone else requires
   * audit leadership and is refused server-side otherwise.
   */
  static async createClassroomAudit(input: {
    name: string;
    teacherId?: string | null;
    reAuditDate?: string | null; // YYYY-MM-DD
  }): Promise<CarreRpcResult<{ success: true; cycle_id: string }>> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_carre_create_classroom_audit',
      {
        p_name: input.name,
        p_teacher_id: input.teacherId ?? null,
        p_re_audit_date: input.reAuditDate ?? null,
      },
    );
    if (error) throw error;
    return data;
  }

  /**
   * The owner-side reveal: own score beside the sealed learner median per
   * item, read from the SCF drip. Every gate is server-side — this call just
   * reports which lock is holding.
   */
  static async getClassroomCompare(
    cycleId: string,
  ): Promise<ClassroomCompareResult> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_classroom_practice_compare',
      { p_cycle_id: cycleId },
    );
    if (error) throw error;
    return data as ClassroomCompareResult;
  }

  /**
   * Sealed learner comments from the drip — PRINCIPAL & DIRECTOR ONLY. The
   * cycle's owner is refused server-side before any role check (the person
   * described never reads these), and comments batch-reveal on the SAME
   * config-driven completed window as the scores. Defensive: any transport
   * failure resolves to a locked shape, so the card simply doesn't render.
   */
  static async getClassroomSealedComments(
    cycleId: string,
  ): Promise<ClassroomSealedCommentsResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_classroom_practice_sealed_comments',
        { p_cycle_id: cycleId },
      );
      if (error) return { locked: true, reason: 'unavailable' };
      return (data ?? { locked: true, reason: 'unavailable' }) as ClassroomSealedCommentsResult;
    } catch {
      return { locked: true, reason: 'unavailable' };
    }
  }

  /**
   * Type-ahead over team members for the Classroom Practice form. Returns
   * profiles.id (the audit cycle's owner column references auth.users, so a
   * staff-table id would not work). Institution-scoped server-side.
   */
  static async searchTeachers(q: string): Promise<CarreTeacherOption[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_search_teachers', {
      p_q: q,
    });
    if (error) throw error;
    return (data ?? []) as CarreTeacherOption[];
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
