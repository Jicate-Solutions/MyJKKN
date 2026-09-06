/**
 * HR Biometric — undo an imported month.
 * Created: 2026-08-20.
 * Migration: supabase/migrations/20260820150000_biometric_import_purge_super_admin.sql
 *
 * Every call goes through the CALLER'S own client, never the service role.
 * All three RPCs gate on is_super_admin(), which reads profiles.is_super_admin
 * for auth.uid() — and auth.uid() is NULL under the service role, so a
 * service-role shortcut would fail 42501 rather than escalate. The session
 * client is not an optimisation here, it is the only thing that works.
 *
 * Follows the HR module convention (static class, SupabaseClient first arg).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BiometricImportBatch,
  BiometricPurgePreview,
  BiometricPurgeReceipt,
} from '@/types/hr-biometric';

export class BiometricImportPurgeService {
  /** Every imported month, newest first, grouped by the machine that produced it. */
  static async listBatches(supabase: SupabaseClient): Promise<BiometricImportBatch[]> {
    const { data, error } = await supabase.rpc('fn_biometric_import_batches');
    if (error) throw error;
    return (data ?? []) as BiometricImportBatch[];
  }

  /** What a purge would remove or detach. Read before offering the confirm. */
  static async preview(
    supabase: SupabaseClient,
    machineInstitutionId: string,
    monthStart: string,
  ): Promise<BiometricPurgePreview> {
    const { data, error } = await supabase.rpc('fn_biometric_import_purge_preview', {
      p_machine_id: machineInstitutionId,
      p_month: monthStart,
    });
    if (error) throw error;
    return data as BiometricPurgePreview;
  }

  /** Irreversible. Returns a receipt of what actually went. */
  static async purge(
    supabase: SupabaseClient,
    machineInstitutionId: string,
    monthStart: string,
  ): Promise<BiometricPurgeReceipt> {
    const { data, error } = await supabase.rpc('fn_biometric_import_purge', {
      p_machine_id: machineInstitutionId,
      p_month: monthStart,
    });
    if (error) throw error;
    return data as BiometricPurgeReceipt;
  }
}
