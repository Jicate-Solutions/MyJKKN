import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * BillingApportionmentService
 *
 * Internal, accounts-only overlay that records how much of a BUNDLED tuition
 * bill belongs to a revenue head (a billing_categories row: Hostel/Transport/Mess Fee).
 *
 * HARD INVARIANT: this service NEVER writes to billing_student_bills. It only
 * reads bills and writes the separate overlay tables. Lifecycle transitions go
 * through SECURITY DEFINER RPCs (dual-control enforced in-DB).
 *
 * Heads = existing billing_categories rows. Precedent: refund-workflow-service.ts
 * (billing-refund-service.ts, the receipt-based predecessor, was retired).
 */

export type SplitMethod = 'fixed' | 'percent';
export type ApportionmentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface RevenueHead {
  id: string;
  category_name: string;
  kind: string;
}

export interface ApportionmentRule {
  id: string;
  institution_id: string | null;
  fee_structure_id: string | null;
  accommodation_type_id: string | null;
  billing_category_id: string;
  split_method: SplitMethod;
  split_value: number;
  status: ApportionmentStatus;
  is_active: boolean;
  effective_from: string;
  change_reason?: string | null;
}

export interface BillApportionment {
  id: string;
  bill_id: string;
  institution_id: string;
  billing_category_id: string;
  amount: number;
  source: 'rule' | 'manual' | 'backfill';
  status: ApportionmentStatus;
  source_method?: SplitMethod | null;
  source_value?: number | null;
  created_at: string;
}

export class BillingApportionmentService {
  private static supabase = createClientSupabaseClient();

  // --- Revenue heads = existing billing_categories (Hostel/Transport/Mess) ---
  static async listRevenueHeads(): Promise<RevenueHead[]> {
    const { data, error } = await this.supabase
      .from('billing_categories')
      .select('id, category_name, kind')
      .in('kind', ['hostel', 'transport', 'mess'])
      .eq('is_active', true)
      .order('kind');
    if (error) throw error;
    return (data ?? []) as RevenueHead[];
  }

  // --- Lookups for rule scope pickers ---
  static async listAccommodationTypes(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.supabase
      .from('accommodation_types')
      .select('id, name')
      .order('name');
    if (error) throw error;
    return (data ?? []) as { id: string; name: string }[];
  }

  /** JKKN colleges only — query institutions directly (useUserInstitutionAccess is unreliable for pickers). */
  static async listInstitutions(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('id, name')
      .like('name', 'JKKN%')
      .order('name');
    if (error) throw error;
    return (data ?? []) as { id: string; name: string }[];
  }

  // --- Rules (per-package defaults) ---
  static async listRules(institutionId?: string): Promise<ApportionmentRule[]> {
    let q = this.supabase
      .from('billing_apportionment_rules')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ApportionmentRule[];
  }

  static async createRule(
    rule: Pick<
      ApportionmentRule,
      'institution_id' | 'fee_structure_id' | 'accommodation_type_id' | 'billing_category_id' | 'split_method' | 'split_value'
    > & { change_reason?: string }
  ): Promise<ApportionmentRule> {
    const { data, error } = await this.supabase
      .from('billing_apportionment_rules')
      .insert({ ...rule, status: 'draft' })
      .select('*')
      .single();
    if (error) throw error;
    return data as ApportionmentRule;
  }

  /** Approve (activate) a rule — direct UPDATE, RLS gates to super-admin/edit. Audit trigger logs 'approve'. */
  static async approveRule(ruleId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase
      .from('billing_apportionment_rules')
      .update({ status: 'approved', change_reason: reason ?? null })
      .eq('id', ruleId);
    if (error) throw error;
  }

  // --- Per-bill apportionment lifecycle (via RPCs — dual-control enforced in DB) ---
  static async getApportionmentsForBill(billId: string): Promise<BillApportionment[]> {
    const { data, error } = await this.supabase
      .from('billing_bill_apportionments')
      .select('*')
      .eq('bill_id', billId)
      .neq('status', 'rejected')
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as BillApportionment[];
  }

  /** Workqueue: all apportionments (optionally by status), with head name joined. */
  static async listApportionments(
    status?: ApportionmentStatus
  ): Promise<(BillApportionment & { category?: { category_name: string; kind: string } })[]> {
    let q = this.supabase
      .from('billing_bill_apportionments')
      .select('*, category:billing_categories(category_name, kind)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as (BillApportionment & { category?: { category_name: string; kind: string } })[];
  }

  static async previewRule(ruleId: string, billId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('fn_apportionment_preview_rule', {
      p_rule_id: ruleId,
      p_bill_id: billId,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  static async applyRule(ruleId: string, billIds: string[], source: 'rule' | 'backfill' = 'rule'): Promise<number> {
    const { data, error } = await this.supabase.rpc('fn_apportionment_apply_rule', {
      p_rule_id: ruleId,
      p_bill_ids: billIds,
      p_source: source,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  /** Manual override: insert a draft apportionment directly (RLS-gated). Guard trigger caps total + sets institution. */
  static async createManual(billId: string, billingCategoryId: string, amount: number, reason?: string): Promise<BillApportionment> {
    const { data, error } = await this.supabase
      .from('billing_bill_apportionments')
      .insert({
        bill_id: billId,
        institution_id: '00000000-0000-0000-0000-000000000000', // overwritten by guard trigger from the bill
        billing_category_id: billingCategoryId,
        amount,
        source: 'manual',
        status: 'draft',
        change_reason: reason ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as BillApportionment;
  }

  static async submit(ids: string[]): Promise<number> {
    const { data, error } = await this.supabase.rpc('fn_apportionment_submit', { p_ids: ids });
    if (error) throw error;
    return Number(data ?? 0);
  }

  static async approve(ids: string[], reason?: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('fn_apportionment_approve', { p_ids: ids, p_reason: reason ?? null });
    if (error) throw error;
    return Number(data ?? 0);
  }

  static async reject(ids: string[], reason?: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('fn_apportionment_reject', { p_ids: ids, p_reason: reason ?? null });
    if (error) throw error;
    return Number(data ?? 0);
  }
}
