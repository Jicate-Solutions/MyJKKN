// lib/services/admission/referral-import-service.ts
// Upload → validate → enrich → report → (senior) promote. Session client; RLS +
// the promote RPC gate the write. Parsing is done in the component (client-side).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ParsedRow, ImportRow, ImportBatch, PromoteResult } from '@/types/referral-import';

export class ReferralImportService {
  /** Create a batch, stage the rows, validate + enrich. Returns the batch id. */
  static async upload(filename: string, rows: ParsedRow[]): Promise<string> {
    const supabase = createClientSupabaseClient();
    const { data: u } = await supabase.auth.getUser();

    const { data: batch, error: bErr } = await (supabase as any)
      .from('referral_import_batches')
      .insert({ filename, status: 'draft', row_count: rows.length, uploaded_by: u?.user?.id ?? null })
      .select('id').single();
    if (bErr) throw new Error(bErr.message);
    const batchId = batch.id as string;

    const staged = rows.map((r, i) => ({ ...r, batch_id: batchId, row_number: i + 1 }));
    // insert in chunks to stay well under payload limits
    for (let i = 0; i < staged.length; i += 500) {
      const { error } = await (supabase as any).from('referral_import_rows').insert(staged.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    const { error: vErr } = await (supabase as any).rpc('fn_validate_referral_import_batch', { p_batch_id: batchId });
    if (vErr) throw new Error(vErr.message);
    const { error: eErr } = await (supabase as any).rpc('fn_enrich_referral_import_batch', { p_batch_id: batchId });
    if (eErr) throw new Error(eErr.message);
    return batchId;
  }

  static async getBatch(batchId: string): Promise<ImportBatch> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).from('referral_import_batches').select('*').eq('id', batchId).single();
    if (error) throw new Error(error.message);
    return data as ImportBatch;
  }

  static async getRows(batchId: string): Promise<ImportRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('referral_import_rows').select('*').eq('batch_id', batchId).order('row_number');
    if (error) throw new Error(error.message);
    return (data || []) as ImportRow[];
  }

  /** Senior approve → write. Returns what was written. */
  static async promote(batchId: string): Promise<PromoteResult> {
    const supabase = createClientSupabaseClient();
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any).rpc('fn_promote_referral_import_batch', {
      p_batch_id: batchId, p_approver: u?.user?.id ?? null,
    });
    if (error) throw new Error(error.message);
    return data as PromoteResult;
  }

  static async recentBatches(): Promise<ImportBatch[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('referral_import_batches').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return (data || []) as ImportBatch[];
  }
}
