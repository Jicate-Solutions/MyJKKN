// lib/services/admission/consultant-payout-readiness-service.ts
// Read-only. Wraps ONE RPC, fn_consultant_payout_readiness.
//
// Filling in an agency's bank account or PAN happens on that agency's own edit
// screen, which already owns the form, the validation and the permission. This
// service deliberately has no write method: a second place to edit payout details
// is a second place for them to be wrong.
//
// Session (browser) client — the RPC gates on
// admission.consultants.commissions.view, or admin.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AgencyPayoutReadiness {
  consultant_id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  /** Referrals for the year, counted the same way the generator counts candidates. */
  referrals: number;
  /** Human labels for what is absent: 'Bank account' | 'PAN' | 'IFSC'. */
  missing: string[];
  /** The generator's own test: bank account AND PAN. IFSC is reported but does
   *  not decide this, because it does not decide the generator's either. */
  generator_ready: boolean;
}

export interface PayoutReadinessSummary {
  total: number;
  ready: number;
  blocked: number;
  /** The agencies actually worth phoning. */
  blocked_with_referrals: number;
  /** Blocked, but nobody is owed them anything — chasing these moves no money. */
  blocked_idle: number;
  referrals_stuck: number;
}

export interface PayoutReadinessResult {
  academic_year: number;
  generated_at: string;
  agencies: AgencyPayoutReadiness[];
  summary: PayoutReadinessSummary;
}

export class ConsultantPayoutReadinessService {
  static async get(academicYear: number): Promise<PayoutReadinessResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_consultant_payout_readiness', {
      p_year: academicYear,
    });
    if (error) throw new Error(error.message);
    return data as PayoutReadinessResult;
  }

  /** CSV for the desk to work from — the same rows, in the same order. */
  static toCsv(rows: AgencyPayoutReadiness[]): string {
    const esc = (v: string | number | null) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Agency', 'Contact person', 'Email', 'Phone', 'Referrals', 'Missing'];
    const body = rows.map((r) =>
      [r.name, r.contact_person, r.email, r.phone, r.referrals, r.missing.join(' + ')]
        .map(esc).join(','),
    );
    return [header.join(','), ...body].join('\n');
  }
}
