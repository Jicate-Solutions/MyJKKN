import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * BillingLateChargeService — read-only client for the platform-wide
 * late-payment charge MECHANISM (Director's plan, rank 1; 2026-08-07).
 *
 * The mechanism is OFF at every layer today: the billing.late_charge.enabled
 * policy row seeds false, no schedule exists, and this service deliberately
 * exposes NO accrual call — the admin page's only action is preview.
 * fn_late_charge_accrue is reachable only from the (unscheduled) cron route
 * and by the Director by hand.
 *
 * Every method degrades gracefully while the late-charge migration is
 * unapplied (missing table / missing function → empty result), so the code
 * half is safe to deploy first.
 */

export interface LateChargePolicySnapshot {
  enabled: boolean;
  /** True once the billing.late_charge.* policy rows exist in the database. */
  installed: boolean;
  ratePercentPerMonth: number;
  compounding: boolean;
  graceDays: number;
  warningLeadDays: number;
  /** '' until the Director sets the start date. */
  effectiveFrom: string;
  warningTemplate: string;
}

export interface LateChargePreviewRow {
  bill_id: string;
  student_id: string;
  learner_name: string | null;
  institution_id: string;
  bill_description: string | null;
  due_date: string;
  months_overdue: number;
  balance_amount: number;
  would_charge: number;
  total_would_owe: number;
}

export interface WaivedLateCharge {
  id: string;
  bill_id: string;
  student_id: string;
  institution_id: string;
  period_start: string;
  period_end: string;
  charge_amount: number;
  waived_by: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
}

/** Summary returned by fn_late_charge_waive_bill — the "waive whole bill" action. */
export interface WaiveBillResult {
  bill_id: string;
  rows_waived: number;
  penalty_bills_cancelled: number;
  total_amount_waived: number;
}

const POLICY_DEFAULTS: Omit<LateChargePolicySnapshot, 'installed'> = {
  enabled: false,
  ratePercentPerMonth: 10,
  compounding: true,
  graceDays: 0,
  warningLeadDays: 7,
  effectiveFrom: '',
  warningTemplate: '',
};

export class BillingLateChargeService {
  private static supabase = createClientSupabaseClient();

  /** The seven billing.late_charge.* policy rows, with locked defaults. */
  static async getPolicySnapshot(): Promise<LateChargePolicySnapshot> {
    const { data, error } = await this.supabase
      .from('platform_policies')
      .select('policy_key, value')
      .like('policy_key', 'billing.late_charge.%')
      .eq('scope_type', 'global')
      .eq('is_active', true);

    if (error || !data?.length) {
      // Rows absent = the migration has not been applied yet — everything OFF.
      return { ...POLICY_DEFAULTS, installed: false };
    }

    const byKey = new Map<string, unknown>(data.map((r) => [r.policy_key, r.value]));
    const bool = (k: string, d: boolean) => {
      const v = byKey.get(k);
      return typeof v === 'boolean' ? v : d;
    };
    const num = (k: string, d: number) => {
      const v = byKey.get(k);
      return typeof v === 'number' && Number.isFinite(v) ? v : d;
    };
    const str = (k: string, d: string) => {
      const v = byKey.get(k);
      return typeof v === 'string' ? v : d;
    };

    return {
      installed: byKey.has('billing.late_charge.enabled'),
      enabled: bool('billing.late_charge.enabled', false),
      ratePercentPerMonth: num('billing.late_charge.rate_percent_per_month', 10),
      compounding: bool('billing.late_charge.compounding', true),
      graceDays: num('billing.late_charge.grace_days', 0),
      warningLeadDays: num('billing.late_charge.warning_lead_days', 7),
      effectiveFrom: str('billing.late_charge.effective_from', ''),
      warningTemplate: str('billing.late_charge.warning_template', ''),
    };
  }

  /**
   * Per-bill "what would be charged today" — fn_late_charge_preview.
   * Read-only, works while the master switch is OFF (that is the point).
   * Requires billing.late_charges.view (or super admin) — enforced in the RPC.
   */
  static async getPreview(): Promise<{ rows: LateChargePreviewRow[]; error: string | null }> {
    // 'as never': fn_late_charge_preview is not in the generated DB types until
    // the (Director-gated) migration is applied — same pre-apply idiom as
    // yoy-trajectory-service.ts.
    const { data, error } = await this.supabase.rpc('fn_late_charge_preview' as never);
    if (error) {
      // Missing function (migration unapplied) or missing permission — both
      // are expected states for this page; surface the message, never throw.
      return { rows: [], error: error.message };
    }
    return { rows: (data ?? []) as unknown as LateChargePreviewRow[], error: null };
  }

  /** Waived charges (RLS-scoped) — the Director's waiver trail. */
  static async listWaived(): Promise<WaivedLateCharge[]> {
    // 'as never' + any-builder: billing_late_charges is not in the generated DB
    // types until the migration is applied — same idiom as the id-card services.
    const { data, error } = await (this.supabase.from('billing_late_charges' as never) as any)
      .select(
        'id, bill_id, student_id, institution_id, period_start, period_end, charge_amount, waived_by, waived_at, waiver_reason'
      )
      .eq('status', 'waived')
      .order('waived_at', { ascending: false })
      .limit(100);
    if (error) return []; // table absent until the migration is applied
    return (data ?? []) as WaivedLateCharge[];
  }

  /**
   * Waive EVERY not-yet-waived late charge on one bill in a single action —
   * the "bigger brush" alongside the existing month-by-month
   * fn_late_charge_waive. Same gate (billing.late_charges.waive or super
   * admin), enforced in the RPC. Throws (via Supabase's error) if the bill
   * has no waivable rows, is missing, or the caller lacks the permission —
   * the dialog surfaces the message rather than pretending success.
   */
  static async waiveBill(
    billId: string,
    reason: string
  ): Promise<{ data: WaiveBillResult | null; error: string | null }> {
    // 'as never': fn_late_charge_waive_bill is not in the generated DB types
    // until this (Director-gated) migration is applied — same pre-apply idiom
    // as fn_late_charge_preview above.
    const { data, error } = await this.supabase.rpc('fn_late_charge_waive_bill' as never, {
      p_bill_id: billId,
      p_reason: reason
    } as never);
    if (error) return { data: null, error: error.message };
    return { data: data as unknown as WaiveBillResult, error: null };
  }
}
