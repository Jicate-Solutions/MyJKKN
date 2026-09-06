// lib/services/admission/referral-rate-service.ts
// CRUD for referral_rate_config + the commission generator RPC.
// Session (browser) client — RLS applies: read = commissions.view, write = admin.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ReferralRateConfig,
  CreateReferralRateInput,
  GenerateCommissionsResult,
  InstitutionOption,
  ProgramOption,
} from '@/types/referral-rates';

export class ReferralRateService {
  static async getRates(academicYear?: number): Promise<ReferralRateConfig[]> {
    const supabase = createClientSupabaseClient();
    let query = (supabase as any)
      .from('referral_rate_config')
      .select('*, institution:institutions(id, name), program:programs(id, program_name)')
      .order('academic_year', { ascending: false })
      .order('created_at', { ascending: false });
    if (academicYear) query = query.eq('academic_year', academicYear);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as ReferralRateConfig[];
  }

  static async createRate(input: CreateReferralRateInput): Promise<ReferralRateConfig> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('referral_rate_config')
      .insert({
        academic_year: input.academic_year,
        institution_id: input.institution_id || null,
        program_id: input.program_id || null,
        flat_amount: input.flat_amount,
        tds_percent: input.tds_percent,
        notes: input.notes || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReferralRateConfig;
  }

  static async updateRate(id: string, input: Partial<CreateReferralRateInput>): Promise<ReferralRateConfig> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('referral_rate_config')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReferralRateConfig;
  }

  static async setActive(id: string, isActive: boolean): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('referral_rate_config')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  /**
   * Generate pending commission transactions from attributed consultant referrals.
   * dryRun=true (default) computes and returns a preview, writes nothing.
   */
  static async generate(
    academicYear: number,
    dryRun = true,
    consultantIds?: string[],
  ): Promise<GenerateCommissionsResult> {
    const supabase = createClientSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any).rpc('fn_generate_referral_commissions', {
      p_year: academicYear,
      p_dry_run: dryRun,
      p_consultant_ids: consultantIds && consultantIds.length ? consultantIds : null,
      p_created_by: userData?.user?.id ?? null,
    });
    if (error) throw new Error(error.message);
    return data as GenerateCommissionsResult;
  }

  static async getInstitutions(): Promise<InstitutionOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('institutions').select('id, name').order('name');
    if (error) throw new Error(error.message);
    return (data || []) as InstitutionOption[];
  }

  static async getPrograms(): Promise<ProgramOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('programs').select('id, program_name, institution_id').order('program_name');
    if (error) throw new Error(error.message);
    return (data || []) as ProgramOption[];
  }
}
