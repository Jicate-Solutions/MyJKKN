/**
 * HR Recruitment Need Signal Service
 *
 * Wraps the 8 Supabase RPCs (1 orchestrator + 7 input plugins) and provides
 * CRUD for signal_suppressions, escalations, snapshots, and user_visits.
 *
 * Architecture (Decision AT.5): 1 orchestrator + 7 replaceable plugin functions.
 * Each input: (p_institution_id uuid, p_program_id uuid DEFAULT NULL) → hr_signal_input_result.
 * TypeScript mirrors this with ComputeSignalParams.
 *
 * Pattern: static class, SupabaseClient as first arg (matches LeaveService, RecruitmentService).
 * Spec: specs/hr-recruitment-need-signal-2026-05-24.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRecruitmentSignalCache,
  HRSignalInputResult,
  ComputeSignalParams,
  SignalFilters,
  HRRecruitmentSignalSuppression,
  HRRecruitmentSignalSuppressionInsert,
  HRRecruitmentEscalation,
  HRRecruitmentEscalationInsert,
  HRRecruitmentEscalationUpdate,
  HRRecruitmentSignalSnapshot,
  HRRecruitmentSignalSnapshotInsert,
  HRRecruitmentUserVisit,
  HRRecruitmentSignalInput,
  SignalInputKey,
} from '@/types/hr-recruitment-need';

const INPUT_FUNCTION_MAP: Record<SignalInputKey, string> = {
  sanctioned_gap: 'fn_compute_input_sanctioned_gap',
  sfr: 'fn_compute_input_sfr',
  specialization_gap: 'fn_compute_input_specialization_gap',
  workload: 'fn_compute_input_workload',
  projected_intake: 'fn_compute_input_projected_intake',
  attrition_pipeline: 'fn_compute_input_attrition_pipeline',
  peer_benchmark: 'fn_compute_input_peer_benchmark',
};

export class RecruitmentNeedSignalService {
  // ─── Orchestrator RPC ───────────────────────────────────────────────────────

  static async computeSignal(
    supabase: SupabaseClient,
    params: ComputeSignalParams
  ): Promise<HRRecruitmentSignalCache> {
    const { data, error } = await supabase.rpc('fn_compute_recruitment_signal', {
      p_institution_id: params.institution_id,
      p_program_id: params.program_id ?? null,
    });

    if (error) throw error;
    return data as HRRecruitmentSignalCache;
  }

  // ─── Individual Input RPCs ──────────────────────────────────────────────────

  static async computeInput(
    supabase: SupabaseClient,
    inputKey: SignalInputKey,
    params: ComputeSignalParams
  ): Promise<HRSignalInputResult> {
    const fnName = INPUT_FUNCTION_MAP[inputKey];
    if (!fnName) throw new Error(`Unknown input key: ${inputKey}`);

    const { data, error } = await supabase.rpc(fnName, {
      p_institution_id: params.institution_id,
      p_program_id: params.program_id ?? null,
    });

    if (error) throw error;
    return data as HRSignalInputResult;
  }

  // ─── Signal Cache Reads ─────────────────────────────────────────────────────

  static async getCachedSignals(
    supabase: SupabaseClient,
    filters: SignalFilters = {}
  ): Promise<HRRecruitmentSignalCache[]> {
    let query = supabase
      .from('hr_recruitment_signal_cache')
      .select('*')
      .order('composite_score', { ascending: true, nullsFirst: false });

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.program_id !== undefined) {
      query = filters.program_id === null
        ? query.is('program_id', null)
        : query.eq('program_id', filters.program_id);
    }
    if (filters.overall_status) {
      query = query.eq('overall_status', filters.overall_status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRRecruitmentSignalCache[];
  }

  static async getCachedSignal(
    supabase: SupabaseClient,
    institutionId: string,
    programId?: string | null
  ): Promise<HRRecruitmentSignalCache | null> {
    let query = supabase
      .from('hr_recruitment_signal_cache')
      .select('*')
      .eq('institution_id', institutionId);

    query = programId
      ? query.eq('program_id', programId)
      : query.is('program_id', null);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentSignalCache | null;
  }

  // ─── Signal Inputs Registry ─────────────────────────────────────────────────

  static async listSignalInputs(
    supabase: SupabaseClient
  ): Promise<HRRecruitmentSignalInput[]> {
    const { data, error } = await supabase
      .from('hr_recruitment_signal_inputs')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (error) throw error;
    return (data ?? []) as HRRecruitmentSignalInput[];
  }

  // ─── Suppressions CRUD ──────────────────────────────────────────────────────

  static async listSuppressions(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<HRRecruitmentSignalSuppression[]> {
    let query = supabase
      .from('hr_recruitment_signal_suppressions')
      .select('*')
      .eq('is_active', true)
      .order('suppress_until', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRRecruitmentSignalSuppression[];
  }

  static async createSuppression(
    supabase: SupabaseClient,
    insert: HRRecruitmentSignalSuppressionInsert
  ): Promise<HRRecruitmentSignalSuppression> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_recruitment_signal_suppressions')
      .insert({ ...insert, suppressed_by: userId })
      .select()
      .single();

    if (error) throw error;
    return data as HRRecruitmentSignalSuppression;
  }

  static async unsnoozeSuppression(
    supabase: SupabaseClient,
    suppressionId: string,
    reason: string
  ): Promise<HRRecruitmentSignalSuppression> {
    const { data, error } = await supabase
      .from('hr_recruitment_signal_suppressions')
      .update({
        is_active: false,
        unsnoozed_at: new Date().toISOString(),
        unsnoozed_reason: reason,
      })
      .eq('id', suppressionId)
      .select()
      .single();

    if (error) throw error;
    return data as HRRecruitmentSignalSuppression;
  }

  // ─── Escalations CRUD ──────────────────────────────────────────────────────

  static async listEscalations(
    supabase: SupabaseClient,
    institutionId?: string,
    statusFilter?: string
  ): Promise<HRRecruitmentEscalation[]> {
    let query = supabase
      .from('hr_recruitment_escalations')
      .select('*')
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRRecruitmentEscalation[];
  }

  static async createEscalation(
    supabase: SupabaseClient,
    insert: HRRecruitmentEscalationInsert
  ): Promise<HRRecruitmentEscalation> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_recruitment_escalations')
      .insert({ ...insert, escalated_by: userId })
      .select()
      .single();

    if (error) throw error;
    return data as HRRecruitmentEscalation;
  }

  static async updateEscalation(
    supabase: SupabaseClient,
    escalationId: string,
    update: HRRecruitmentEscalationUpdate
  ): Promise<HRRecruitmentEscalation> {
    const resolveFields = update.status === 'resolved' || update.status === 'dismissed'
      ? {
          resolved_by: (await supabase.auth.getUser()).data.user?.id,
          resolved_at: new Date().toISOString(),
        }
      : {};

    const { data, error } = await supabase
      .from('hr_recruitment_escalations')
      .update({ ...update, ...resolveFields })
      .eq('id', escalationId)
      .select()
      .single();

    if (error) throw error;
    return data as HRRecruitmentEscalation;
  }

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  static async listSnapshots(
    supabase: SupabaseClient,
    institutionId?: string
  ): Promise<HRRecruitmentSignalSnapshot[]> {
    let query = supabase
      .from('hr_recruitment_signal_snapshots')
      .select('*')
      .eq('is_archived', false)
      .order('taken_at', { ascending: false });

    if (institutionId) {
      query = query.eq('scope_institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRRecruitmentSignalSnapshot[];
  }

  static async createSnapshot(
    supabase: SupabaseClient,
    insert: HRRecruitmentSignalSnapshotInsert
  ): Promise<HRRecruitmentSignalSnapshot> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_recruitment_signal_snapshots')
      .insert({ ...insert, taken_by: userId })
      .select()
      .single();

    if (error) throw error;
    return data as HRRecruitmentSignalSnapshot;
  }

  // ─── User Visits (change tracking) ──────────────────────────────────────────

  static async recordVisit(
    supabase: SupabaseClient,
    signalsAtVisit?: Record<string, unknown>
  ): Promise<HRRecruitmentUserVisit> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_recruitment_user_visits')
      .upsert(
        {
          user_id: userId,
          last_visited_at: new Date().toISOString(),
          signals_at_visit: signalsAtVisit ?? null,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as HRRecruitmentUserVisit;
  }

  static async getLastVisit(
    supabase: SupabaseClient
  ): Promise<HRRecruitmentUserVisit | null> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_recruitment_user_visits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data as HRRecruitmentUserVisit | null;
  }
}
