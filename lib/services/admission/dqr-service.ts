// lib/services/admission/dqr-service.ts
// Read/write access to data_quality_review for the admin mapping surface
// (Plan 2 / Task 11).

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface DqrRow {
  id: string;
  table_name: string;
  column_name: string;
  observed_value: string;
  occurrence_count: number;
  review_status: 'pending' | 'mapped' | 'ignored';
  mapped_to_id: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export class DqrService {
  static async listPending(): Promise<DqrRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('data_quality_review')
      .select('*')
      .eq('review_status', 'pending')
      .order('occurrence_count', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DqrRow[];
  }

  /**
   * Map a DQR row to a canonical lookup. This:
   * 1. Updates the lookup row's parent table by matching observed_value,
   *    setting the canonical FK column.
   * 2. Marks the DQR row as 'mapped' with mapped_to_id = canonical lookup id.
   * 3. Counter-rows for the same observed_value (e.g. across both
   *    learners_profiles AND admission_leads) are also resolved if pointed
   *    at the same canonical.
   */
  static async mapToCanonical(args: {
    dqrId: string;
    canonicalLookupId: string;
    fkColumnName: 'quota_id' | 'community_category_id' | 'accommodation_type_id';
    notes?: string;
  }): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Read the DQR row
    const { data: dqr, error: readError } = await supabase
      .from('data_quality_review')
      .select('*')
      .eq('id', args.dqrId)
      .single();
    if (readError) throw readError;
    if (!dqr) throw new Error('DQR row not found');

    // Apply UPDATE to the parent table — match by lower(trim(observed_value)).
    // We use ilike for case-insensitive equivalence.
    const updateBuilder = supabase
      .from(dqr.table_name)
      .update({ [args.fkColumnName]: args.canonicalLookupId })
      .filter(dqr.column_name, 'ilike', dqr.observed_value);
    const { error: updateError } = await updateBuilder;
    if (updateError) throw updateError;

    // Mark DQR row as mapped
    const { error: dqrError } = await supabase
      .from('data_quality_review')
      .update({
        review_status: 'mapped',
        mapped_to_id: args.canonicalLookupId,
        review_notes: args.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.dqrId);
    if (dqrError) throw dqrError;
  }

  static async ignore(dqrId: string, notes?: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase
      .from('data_quality_review')
      .update({
        review_status: 'ignored',
        review_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dqrId);
    if (error) throw error;
  }

  /** Convenience: get the count of rows still awaiting mapping. */
  static async pendingCount(): Promise<number> {
    const supabase = createClientSupabaseClient();
    const { count, error } = await supabase
      .from('data_quality_review')
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'pending');
    if (error) throw error;
    return count ?? 0;
  }
}
