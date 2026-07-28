// lib/services/admission/payout-batch-service.ts
// Payout batches via the proven DB engine. Session client — RLS applies; the
// create/advance RPCs self-guard to admins.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { PayoutBatch, PayoutBatchStatus, CreatePayoutBatchResult } from '@/types/payout-batches';

export class PayoutBatchService {
  static async getBatches(): Promise<PayoutBatch[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('consultant_payout_batches')
      .select('*, institution:institutions(id, name)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as PayoutBatch[];
  }

  /** How many approved, un-batched commissions are ready for a payout batch. */
  static async getReadyCount(institutionId: string): Promise<number> {
    const supabase = createClientSupabaseClient();
    const { count, error } = await (supabase as any)
      .from('consultant_commission_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'approved')
      .is('payout_batch_id', null);
    if (error) throw new Error(error.message);
    return count || 0;
  }

  static async createBatch(
    institutionId: string, batchName: string, consultantIds?: string[],
  ): Promise<CreatePayoutBatchResult> {
    const supabase = createClientSupabaseClient();
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any).rpc('fn_create_payout_batch', {
      p_institution_id: institutionId,
      p_batch_name: batchName,
      p_consultant_ids: consultantIds && consultantIds.length ? consultantIds : null,
      p_prepared_by: u?.user?.id ?? null,
    });
    if (error) throw new Error(error.message);
    return data as CreatePayoutBatchResult;
  }

  static async advance(
    batchId: string, toStatus: Exclude<PayoutBatchStatus, 'prepared'>,
    opts?: { paymentMode?: string; bankReference?: string; reason?: string },
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).rpc('fn_advance_payout_batch', {
      p_batch_id: batchId,
      p_to_status: toStatus,
      p_actor: u?.user?.id ?? null,
      p_payment_mode: opts?.paymentMode ?? null,
      p_bank_reference: opts?.bankReference ?? null,
      p_reason: opts?.reason ?? null,
    });
    if (error) throw new Error(error.message);
  }

  static async getInstitutions(): Promise<{ id: string; name: string }[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).from('institutions').select('id, name').order('name');
    if (error) throw new Error(error.message);
    return (data || []) as { id: string; name: string }[];
  }
}
