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
}
