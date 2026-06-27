// lib/services/induction/induction-service.ts
// Fresher Induction — client-side service (browser supabase + RLS/RPC).
// Mirrors the SessionFeedbackService / PDEService pattern (static methods over
// getSupabase()). Privileged writes flow through the SECURITY DEFINER engine
// RPCs in 20260627170000_induction_phase1_engine_rpcs.sql (anon-revoked,
// auth+permission gated internally). Spec: specs/induction-program-module-2026-06-27.md
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export interface CreateInductionInput {
  institutionId: string;
  academicYearId: string | null;
  name: string;
  startDate: string; // ISO
  endDate: string;   // ISO
  venueText?: string;
  description?: string | null;
}

export class InductionService {
  /** Create the induction (events row event_type='induction' + satellite). Returns event_id. */
  static async createProgram(input: CreateInductionInput): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_create_program', {
      p_institution_id: input.institutionId,
      p_academic_year_id: input.academicYearId,
      p_name: input.name,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_venue_text: input.venueText ?? 'Campus',
      p_description: input.description ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Auto-enroll the joining cohort (first-years + laterals). Returns count enrolled. */
  static async autoEnroll(eventId: string): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_auto_enroll', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** Auto-split enrollees into N batches by department. Returns learners assigned. */
  static async autoSplitBatches(eventId: string, numBatches = 2): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_auto_split_batches', {
      p_event_id: eventId,
      p_num_batches: numBatches,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }
}
