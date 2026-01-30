// ============================================================================
// OKR Key Result Service
// Handles CRUD operations for Key Results
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OKRKeyResult,
  OKRListResponse,
  CreateOKRKeyResultDTO,
  UpdateOKRKeyResultDTO
} from '@/types/okr';

export class OKRKeyResultService {
  // Get fresh client for each request to ensure auth token is current
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Get key results for an objective
   */
  static async getKeyResultsByObjective(
    objectiveId: string
  ): Promise<OKRKeyResult[]> {
    try {
      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .select('*')
        .eq('objective_id', objectiveId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching key results:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get single key result by ID
   */
  static async getKeyResultById(id: string): Promise<OKRKeyResult> {
    try {
      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .select(
          `
          *,
          objective:okr_objectives(id, title, owner_id),
          updates:okr_kr_updates(*)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Key result not found');

      return data;
    } catch (error: any) {
      console.error('[OKR] Error fetching key result:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Create new key result
   */
  static async createKeyResult(
    input: CreateOKRKeyResultDTO
  ): Promise<OKRKeyResult> {
    try {
      // Get max order_index for this objective
      const { data: existing } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .select('order_index')
        .eq('objective_id', input.objective_id)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextIndex = existing?.[0]?.order_index
        ? existing[0].order_index + 1
        : 0;

      const insertData = {
        ...input,
        current_value: input.start_value,
        progress_percentage: 0,
        status: 'not_started',
        order_index: input.order_index ?? nextIndex
      };

      console.log('[OKR] Creating key result with data:', JSON.stringify(insertData, null, 2));

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Key result created successfully');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error creating key result:', JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      }, null, 2));
      toast.error(`Failed to create key result: ${error?.message || 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Update key result
   */
  static async updateKeyResult(
    id: string,
    input: UpdateOKRKeyResultDTO
  ): Promise<OKRKeyResult> {
    try {
      // Verify auth state first
      const { data: { user }, error: authError } = await this.getSupabase().auth.getUser();
      if (authError || !user) {
        console.error('[OKR] Auth error or no user:', authError?.message || 'No user session');
        throw new Error('Authentication required. Please log in again.');
      }
      console.log('[OKR] Updating key result. User:', user.id, 'KR ID:', id);

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        // Log as strings for visibility in console tools
        console.error('[OKR] KR UPDATE ERROR - message:', error.message);
        console.error('[OKR] KR UPDATE ERROR - code:', error.code);
        console.error('[OKR] KR UPDATE ERROR - details:', error.details);
        console.error('[OKR] KR UPDATE ERROR - hint:', error.hint);
        console.error('[OKR] KR UPDATE ERROR - stringified:', JSON.stringify(error));
        console.error('[OKR] KR UPDATE ERROR - String():', String(error));
        console.error('[OKR] KR UPDATE ERROR - keys:', Object.keys(error).join(', '));
        throw error;
      }

      toast.success('Key result updated successfully');
      return data;
    } catch (error: any) {
      // Comprehensive error logging - each property as separate log for visibility
      const errorString = String(error);
      const errorMessage = error?.message || errorString || 'Unknown error';
      console.error('[OKR] KR CATCH - type:', error?.constructor?.name);
      console.error('[OKR] KR CATCH - keys:', error ? Object.keys(error).join(', ') : 'null');
      console.error('[OKR] KR CATCH - message:', error?.message);
      console.error('[OKR] KR CATCH - code:', error?.code);
      console.error('[OKR] KR CATCH - String():', errorString);
      toast.error(`Failed to update key result: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update key result progress (current_value)
   */
  static async updateProgress(
    id: string,
    newValue: number,
    source: 'auto' | 'manual' = 'manual',
    checkInId?: string,
    exceptionNote?: string
  ): Promise<OKRKeyResult> {
    try {
      // Get current value first
      const { data: current, error: fetchError } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .select('current_value')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Update the key result
      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .update({
          current_value: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Record the update if check-in provided
      if (checkInId) {
        await (this.getSupabase() as any).from('okr_kr_updates').insert([
          {
            key_result_id: id,
            check_in_id: checkInId,
            previous_value: current.current_value,
            new_value: newValue,
            source,
            exception_flagged: !!exceptionNote,
            exception_note: exceptionNote,
            auto_calculated: source === 'auto'
          }
        ]);
      }

      return data;
    } catch (error: any) {
      console.error('[OKR] Error updating progress:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to update progress');
      throw error;
    }
  }

  /**
   * Delete key result
   */
  static async deleteKeyResult(id: string): Promise<void> {
    try {
      const { error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Key result deleted successfully');
    } catch (error: any) {
      console.error('[OKR] Error deleting key result:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to delete key result');
      throw error;
    }
  }

  /**
   * Reorder key results
   */
  static async reorderKeyResults(
    objectiveId: string,
    orderedIds: string[]
  ): Promise<void> {
    try {
      const updates = orderedIds.map((id, index) => ({
        id,
        order_index: index
      }));

      for (const update of updates) {
        await (this.getSupabase() as any)
          .from('okr_key_results')
          .update({ order_index: update.order_index })
          .eq('id', update.id);
      }

      toast.success('Key results reordered');
    } catch (error: any) {
      console.error('[OKR] Error reordering key results:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to reorder key results');
      throw error;
    }
  }

  /**
   * Get all auto-tracked key results needing sync
   */
  static async getAutoTrackedKeyResults(): Promise<OKRKeyResult[]> {
    try {
      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .select(
          `
          *,
          objective:okr_objectives(id, status, owner_id, institution_id)
        `
        )
        .eq('data_source', 'auto')
        .eq('objective.status', 'active');

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching auto-tracked KRs:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }
}
