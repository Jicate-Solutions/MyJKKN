// lib/services/admission/consultant-directory-service.ts
// Read-only. Wraps ONE RPC, fn_consultant_directory.
//
// Why this exists rather than reading education_consultants directly: the stored
// columns that screen used to show carry no year at all, and two of them are not
// true. total_leads_referred sums to 1,839 against 1,626 real referrals, and
// total_conversions is 0 for all 186 agencies — so conversion_rate, which was
// both displayed and used as a sort key, was 0 for everyone.
//
// Counts here are computed live per intake year, using the SAME enrolled
// allow-list as the commission generator, so "enrolled" on the directory and
// "payable" in the payment run cannot drift apart.
//
// Session (browser) client — the RPC gates on admission.consultants.view, or admin.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ConsultantDirectoryRow {
  consultant_id: string;
  name: string;
  consultant_type: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  /** Referrals in the selected intake year — live, not the stored lifetime column. */
  referrals: number;
  /** Of those, the ones who actually took the seat (active/admitted/reserved/graduated). */
  enrolled: number;
  /** Bank account AND PAN on file — the generator's own payable test. */
  payout_ready: boolean;
}

export interface ConsultantDirectorySummary {
  agencies_total: number;
  /** Agencies that sent someone in the selected year. The list shows every
   *  agency so a zero is visible; this is the number that means something. */
  agencies_active: number;
  referrals: number;
  enrolled: number;
  payout_ready: number;
}

export interface ConsultantDirectoryResult {
  /** null = all years. */
  academic_year: number | null;
  generated_at: string;
  /** Intake years that actually carry a referral, newest first. Derived, so a
   *  new year appears the day its first referral lands — no code change. */
  years: number[];
  agencies: ConsultantDirectoryRow[];
  summary: ConsultantDirectorySummary;
}

export class ConsultantDirectoryService {
  /** @param academicYear intake year, or null for every year. */
  static async get(
    academicYear: number | null,
    institutionId?: string | null,
  ): Promise<ConsultantDirectoryResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_consultant_directory', {
      p_year: academicYear,
      p_institution_id: institutionId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as ConsultantDirectoryResult;
  }
}
