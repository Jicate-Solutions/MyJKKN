// lib/services/induction/induction-pulse-service.ts
// Induction live in-session pulse — thin client over the SECURITY DEFINER RPCs
// in 20260629150000_induction_session_pulse.sql. Resource-person methods (open /
// close / totals) and the learner discovery method live together because they are
// the two ends of ONE feature. Browser supabase + RLS/DEFINER, same pattern as the
// other induction services. Student answers still go through InductionService
// (fn_induction_submit_feedback) — this service never writes feedback.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export interface InductionPulse {
  id: string;
  session_id: string;
  event_id: string;
  institution_id: string;
  is_open: boolean;
  issued_at: string;
  auto_close_at: string;
}

export interface PulseTotals {
  is_open: boolean;
  auto_close_at: string;
  enrolled_count: number;
  response_count: number;
  suppressed: boolean;
  avg_rating: number | null;
  dist: Record<string, number> | null;
}

export interface OpenPulseForLearner {
  pulse_id: string;
  session_id: string;
  event_id: string;
  event_name: string | null;
  title: string | null;
  day_number: number | null;
  auto_close_at: string;
  already_answered: boolean;
}

// A composite (single-row) RETURN comes back as an object; a TABLE return comes
// back as an array. Normalise both to "the first row".
function firstRow<T>(data: any): T | null {
  if (data == null) return null;
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

export class InductionPulseService {
  /** Resource person / coordinator opens (or re-opens, idempotent) a live pulse. */
  static async openSessionPulse(sessionId: string): Promise<InductionPulse | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_open_session_pulse', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return firstRow<InductionPulse>(data);
  }

  /** Close a pulse early (same authority as open). */
  static async closeSessionPulse(pulseId: string): Promise<InductionPulse | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_close_session_pulse', {
      p_pulse_id: pulseId,
    });
    if (error) throw error;
    return firstRow<InductionPulse>(data);
  }

  /** Live anonymized totals for one pulse (k>=3 floor enforced server-side). */
  static async getSessionPulseTotals(pulseId: string): Promise<PulseTotals | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_pulse_totals', {
      p_pulse_id: pulseId,
    });
    if (error) throw error;
    return firstRow<PulseTotals>(data);
  }

  /** A fresher's currently-open pulses (enrolled + their batch only). */
  static async getMyOpenPulses(): Promise<OpenPulseForLearner[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_session_pulse_for_learner');
    if (error) throw error;
    return (data as OpenPulseForLearner[]) ?? [];
  }
}
