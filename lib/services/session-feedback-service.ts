// lib/services/session-feedback-service.ts
// Post-class feedback — client-side service (browser supabase + RLS/RPC).
// Mirrors the PDEService pattern (static methods over getSupabase()).
// All writes + privileged reads flow through the SECURITY DEFINER RPCs in
// 20260615233000_session_feedback_substrate.sql.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  SessionFeedbackRow,
  PendingSession,
  ConfirmationStatusRow,
  FacultySummaryRow,
  EscalationRow,
  ChecklistConfigItem,
  SubmitFeedbackInput,
} from '@/types/session-feedback';

// Untyped client — session_feedback tables are not in the generated types yet.
const getSupabase = (): any => createClientSupabaseClient();

export class SessionFeedbackService {
  /** Active checklist config: institution overrides shadow platform defaults by item_key. */
  static async getChecklistConfig(institutionId?: string | null): Promise<ChecklistConfigItem[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('session_feedback_checklist_config')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(`Failed to load checklist config: ${error.message}`);
    const rows = (data || []) as ChecklistConfigItem[];
    // Prefer an institution-specific item over the platform default of the same key.
    const byKey = new Map<string, ChecklistConfigItem>();
    for (const r of rows) {
      const existing = byKey.get(r.item_key);
      if (!existing || (r.institution_id && institutionId && r.institution_id === institutionId)) {
        byKey.set(r.item_key, r);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.sort_order - b.sort_order);
  }

  /** Sessions the learner attended (Present) but hasn't given feedback for. */
  static async getPending(lookbackDays = 30): Promise<PendingSession[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_pending_for_learner', {
      p_lookback_days: lookbackDays,
    });
    if (error) throw new Error(`Failed to load pending sessions: ${error.message}`);
    return (data || []) as PendingSession[];
  }

  /** Per-session confirmation state (present-pending vs confirmed) in a date range. */
  static async getConfirmationStatus(from: string, to: string): Promise<ConfirmationStatusRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_confirmation_status', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load confirmation status: ${error.message}`);
    return (data || []) as ConfirmationStatusRow[];
  }

  /** Submit (or update) feedback for a session. The only write path. */
  static async submitFeedback(input: SubmitFeedbackInput): Promise<SessionFeedbackRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_submit_feedback', {
      p_attendance_date: input.attendanceDate,
      p_timetable_id: input.timetableId,
      p_period_id: input.periodId,
      p_understood: input.understood,
      p_checklist: input.checklist ?? {},
      p_free_text: input.freeText ?? null,
    });
    if (error) throw new Error(`Failed to submit feedback: ${error.message}`);
    return data as SessionFeedbackRow;
  }

  /** Anonymized aggregate over the caller faculty's own sessions. */
  static async getFacultySummary(from: string, to: string): Promise<FacultySummaryRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_faculty_summary', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load faculty summary: ${error.message}`);
    return (data || []) as FacultySummaryRow[];
  }

  /** Institution sessions breaching the understanding threshold (Principal view). */
  static async getEscalations(from: string, to: string): Promise<EscalationRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_principal_escalations', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load escalations: ${error.message}`);
    return (data || []) as EscalationRow[];
  }
}
