// ============================================================================
// OKR Key Result Service
// Handles CRUD operations for Key Results
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import {
  ensureNumber,
  ensureArray,
  isValidNumber,
  clampNumber
} from '@/lib/utils/validation';
import type {
  OKRKeyResult,
  OKRListResponse,
  CreateOKRKeyResultDTO,
  UpdateOKRKeyResultDTO,
  ABCDAnalysis,
  ABCDDistribution,
  DCategoryAlert,
  ABCDCategory
} from '@/types/okr';

export class OKRKeyResultService {
  // Get fresh client for each request to ensure auth token is current
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * SECURITY: Validate institution access
   * Ensures user has permission to access the requested institution's data
   * @throws Error if institution_id is invalid or user lacks access
   */
  private static async validateInstitutionAccess(
    institutionId: string
  ): Promise<void> {
    if (!institutionId || institutionId.trim() === '') {
      throw new Error('Institution ID is required');
    }

    const supabase = this.getSupabase();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Check user's institution access
    const { data: access, error } = await (supabase as any)
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (error || !access) {
      console.error('[OKR] Access denied:', { userId: user.id, institutionId });
      throw new Error('Access denied: Institution not accessible to user');
    }
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

  // ============================================================================
  // A/B/C/D MATRIX METHODS
  // ============================================================================

  /**
   * Update process rating for a key result
   */
  static async updateProcessRating(
    keyResultId: string,
    rating: number,
    notes?: string
  ): Promise<OKRKeyResult> {
    try {
      // SAFETY: Validate and clamp rating to 1-5 range
      const validRating = clampNumber(rating, 1, 5, 3);

      if (validRating !== rating) {
        console.warn('[OKR] Process rating clamped from', rating, 'to', validRating);
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('okr_key_results')
        .update({
          process_rating: validRating,
          process_notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', keyResultId)
        .select()
        .single();

      if (error) throw error;

      toast.success('Process rating updated successfully');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error updating process rating:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to update process rating');
      throw error;
    }
  }

  /**
   * Get ABCD analysis for all key results
   */
  static async getABCDAnalysis(filters?: {
    institution_id?: string;
    department_id?: string;
    owner_id?: string;
    category?: ABCDCategory;
  }): Promise<ABCDAnalysis[]> {
    try {
      let query = (this.getSupabase() as any)
        .from('okr_abcd_analysis')
        .select('*');

      if (filters?.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters?.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters?.owner_id) {
        query = query.eq('owner_id', filters.owner_id);
      }
      if (filters?.category) {
        query = query.eq('abcd_category', filters.category);
      }

      query = query.order('priority_order', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching ABCD analysis:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get ABCD distribution for charts
   */
  static async getABCDDistribution(filters?: {
    institution_id?: string;
    department_id?: string;
    owner_id?: string;
  }): Promise<ABCDDistribution[]> {
    try {
      const { data, error } = await (this.getSupabase() as any)
        .rpc('get_okr_abcd_distribution', {
          p_institution_id: filters?.institution_id || null,
          p_department_id: filters?.department_id || null,
          p_owner_id: filters?.owner_id || null
        });

      if (error) throw error;

      // SAFETY: Ensure data is array and validate numeric fields
      const safeData = ensureArray(data, []);

      return safeData.map((item: any) => ({
        ...item,
        count: ensureNumber(item.count, 0),
        avg_progress: ensureNumber(item.avg_progress, 0),
        avg_process_rating: ensureNumber(item.avg_process_rating, 0)
      }));
    } catch (error: any) {
      console.error('[OKR] Error fetching ABCD distribution:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get D-category alerts (False Security items)
   */
  static async getDCategoryAlerts(institutionId?: string): Promise<DCategoryAlert[]> {
    try {
      const { data, error } = await (this.getSupabase() as any)
        .rpc('get_okr_d_category_alerts', {
          p_institution_id: institutionId || null
        });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching D-category alerts:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }
}
