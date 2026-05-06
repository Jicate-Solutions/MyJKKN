import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionFeeAdmissionSettingsPerInstitution,
  UpsertAdmissionFeeAdmissionSettingsInput,
} from '@/types/admission';

/**
 * Read/write access to admission_settings_per_institution. Hosts the v1
 * feature flag (use_fee_structures) and the required-documents list for the
 * status='account' transition.
 *
 * One row per institution, auto-created at migration time. This service only
 * READS or UPSERTS — never INSERT (rows already exist).
 */
export class AdmissionSettingsService {
  static async getByInstitution(
    institutionId: string,
  ): Promise<AdmissionFeeAdmissionSettingsPerInstitution | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_settings_per_institution')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async upsert(
    input: UpsertAdmissionFeeAdmissionSettingsInput,
  ): Promise<AdmissionFeeAdmissionSettingsPerInstitution> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('admission_settings_per_institution')
      .upsert(input, { onConflict: 'institution_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  /** Convenience: is the feature flag ON for this institution? */
  static async isFeeStructuresEnabled(institutionId: string): Promise<boolean> {
    const row = await this.getByInstitution(institutionId);
    return row?.use_fee_structures ?? false;
  }

  // ==========================================================================
  // Plan 6 / Task 4 (2026-05-05) — Settings admin UI convenience methods.
  // Each is a thin wrapper around upsert() so the page can call ergonomic,
  // intent-named methods rather than building UpsertAdmissionFeeAdmissionSettingsInput
  // shapes inline.
  // ==========================================================================

  /** Toggle the use_fee_structures feature flag for an institution. */
  static async setUseFeeStructures(
    institutionId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.upsert({
      institution_id: institutionId,
      use_fee_structures: enabled,
    });
  }

  /** Replace the required-documents checklist for the status='account' transition. */
  static async setRequiredDocuments(
    institutionId: string,
    docs: string[],
  ): Promise<void> {
    await this.upsert({
      institution_id: institutionId,
      required_documents_for_account_transition: docs,
    });
  }

  /**
   * Count of admission_fee_structures configured for the institution.
   * Used by the settings page to soft-warn when an admin enables
   * use_fee_structures while no structures exist yet.
   *
   * Lazy-imports FeeStructureService to avoid a circular dep — both services
   * live in the same `lib/services/admission/` folder.
   */
  static async getFeeStructureCountForInstitution(
    institutionId: string,
  ): Promise<number> {
    const { FeeStructureService } = await import('./fee-structure-service');
    const list = await FeeStructureService.list(institutionId);
    return list.length;
  }
}
