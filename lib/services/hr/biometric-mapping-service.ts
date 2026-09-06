/**
 * HR Biometric enrolment mapping service.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 *
 * Writes go through the caller's own client so RLS enforces staff.edit plus
 * the caller's module scope — no service-role shortcut. A user who may only
 * edit their own institution's staff will be refused here, loudly.
 *
 * Follows the HR module convention (static class, SupabaseClient first arg).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BiometricMappingSave } from '@/types/hr-biometric';

export class BiometricMappingService {
  /**
   * Replace the enrolment mapping for one machine.
   *
   * Clearing happens BEFORE assigning, deliberately: the unique index is on
   * (machine, normalised code), so reassigning a code between two staff members
   * in one save would collide if the old holder still held it.
   *
   * Returns the number of staff assigned a code.
   */
  static async saveMappings(
    supabase: SupabaseClient,
    { institutionId, assignments }: BiometricMappingSave,
  ): Promise<number> {
    const wanted = assignments.filter((a) => a.staffId) as Array<{ code: string; staffId: string }>;
    const wantedIds = new Set(wanted.map((a) => a.staffId));

    const { data: current, error: curErr } = await supabase
      .from('staff')
      .select('id')
      .eq('biometric_institution_id', institutionId);
    if (curErr) throw curErr;

    const toClear = ((current ?? []) as Array<{ id: string }>)
      .map((r) => r.id)
      .filter((id) => !wantedIds.has(id));

    if (toClear.length > 0) {
      const { error } = await supabase
        .from('staff')
        .update({ biometric_id: null, biometric_institution_id: null })
        .in('id', toClear);
      if (error) throw error;
    }

    // One statement per staff member — each carries a different code.
    let saved = 0;
    for (const a of wanted) {
      const { error } = await supabase
        .from('staff')
        .update({ biometric_id: a.code, biometric_institution_id: institutionId })
        .eq('id', a.staffId);
      if (error) throw error;
      saved += 1;
    }

    return saved;
  }

  /** Everyone currently enrolled on one machine. */
  static async listForMachine(supabase: SupabaseClient, institutionId: string) {
    const { data, error } = await supabase
      .from('staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id')
      .eq('biometric_institution_id', institutionId)
      .not('biometric_id', 'is', null)
      .order('biometric_id', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}
