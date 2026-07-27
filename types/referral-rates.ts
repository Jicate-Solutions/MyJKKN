// types/referral-rates.ts
// Referral payment machine — rate config + generator result shapes.
// Backs referral_rate_config + fn_generate_referral_commissions (migration
// 20260722120000). See SPECS.md §6 F4/F6.

export interface ReferralRateConfig {
  id: string;
  academic_year: number;
  institution_id: string | null;   // null = every institution
  program_id: string | null;       // null = every programme in scope
  flat_amount: number;             // gross rupees per admission
  tds_percent: number;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // populated via joins
  institution?: { id: string; name: string } | null;
  program?: { id: string; program_name: string } | null;
}

export interface CreateReferralRateInput {
  academic_year: number;
  institution_id?: string | null;
  program_id?: string | null;
  flat_amount: number;
  tds_percent: number;
  notes?: string | null;
}

export interface GenerateAgencyLine {
  agency: string;
  referrals: number;
  net: number;
  payable: boolean;
}

export interface GenerateCommissionsResult {
  dry_run: boolean;
  academic_year: number;
  candidates: number;
  payable_now: number;
  blocked_no_bank: number;
  total_gross: number;
  total_tds: number;
  total_net: number;
  rows_written: number;
  by_agency: GenerateAgencyLine[];
}

export interface InstitutionOption { id: string; name: string }
export interface ProgramOption { id: string; program_name: string; institution_id: string | null }
