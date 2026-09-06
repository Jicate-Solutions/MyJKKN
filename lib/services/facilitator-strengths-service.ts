// lib/services/facilitator-strengths-service.ts
// SCF learning-facilitator STRENGTHS board — client-side service.
// The positive mirror of SessionFeedbackService.getFacilitatorFeedbackCoverage.
// Reads the SECURITY DEFINER RPC fn_scf_facilitator_strengths via the browser
// supabase client (session-scoped; the RPC enforces super/institution scope).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FacilitatorStrengthRow } from '@/types/facilitator-strengths';

// Untyped client — scf_ai_suggestions / strengths RPC are not in generated types.
const getSupabase = (): any => createClientSupabaseClient();

export class FacilitatorStrengthsService {
  /** Per learning-facilitator standout 'success' patterns whose teaching window
   *  overlaps [from, to]. Strongest replicators first; empty when none captured. */
  static async getFacilitatorStrengths(
    from: string,
    to: string,
  ): Promise<FacilitatorStrengthRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_scf_facilitator_strengths', {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`Failed to load facilitator strengths: ${error.message}`);
    return (data || []) as FacilitatorStrengthRow[];
  }
}
