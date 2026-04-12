/**
 * Leave/OnDuty Sub-Category Service
 *
 * CRUD for admin-managed sub-categories. Each institution can define its
 * own list of leave/onduty sub-category options, replacing the previously
 * hard-coded LEAVE_SUB_CATEGORIES / ONDUTY_SUB_CATEGORIES constants.
 *
 * Companion migration: supabase/migrations/20260411_add_leave_onduty_sub_categories.sql
 *
 * @module services/academic/leave-onduty-sub-category-service
 * @created 2026-04-11
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LeaveOndutyCategory,
  LeaveOndutySubCategoryRecord,
  SubCategoryFormData,
} from '@/types/leave-onduty';

// Untyped client — this table is not yet in generated database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

export interface SubCategoryListFilters {
  category?: LeaveOndutyCategory;
  activeOnly?: boolean;
}

export class LeaveOndutySubCategoryService {
  /**
   * List sub-categories for an institution. Pass null for super admin
   * (returns rows across all institutions).
   */
  static async list(
    institutionId: string | null,
    filters?: SubCategoryListFilters
  ): Promise<LeaveOndutySubCategoryRecord[]> {
    const supabase = getSupabase();

    let query = supabase
      .from('leave_onduty_sub_categories')
      .select('*, institution:institutions(id, name)')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[leave-onduty/sub-categories] list failed', error);
      throw new Error(error.message || 'Failed to load sub-categories');
    }

    return (data || []) as LeaveOndutySubCategoryRecord[];
  }

  /**
   * Create a new sub-category.
   */
  static async create(
    data: SubCategoryFormData,
    createdBy: string | null
  ): Promise<LeaveOndutySubCategoryRecord> {
    const supabase = getSupabase();

    const payload = {
      institution_id: data.institution_id,
      category: data.category,
      code: data.code.trim().toLowerCase(),
      name: data.name.trim(),
      description: data.description?.trim() || null,
      is_active: true,
      // Sponsor-approval gate fields (Phase 1: stored, surfaced in admin UI)
      requires_sponsor_approval: data.requires_sponsor_approval ?? false,
      sponsor_role_hint: data.sponsor_role_hint?.trim() || null,
      created_by: createdBy,
    };

    const { data: inserted, error } = await supabase
      .from('leave_onduty_sub_categories')
      .insert(payload)
      .select('*, institution:institutions(id, name)')
      .single();

    if (error) {
      console.error('[leave-onduty/sub-categories] create failed', error);
      if (error.code === '23505') {
        throw new Error(
          'A sub-category with this code already exists for this category in this institution'
        );
      }
      if (error.code === '23514') {
        // Disambiguate by constraint name: the table has separate CHECKs for
        // code format, name length, and description length
        const constraint = (error as any).constraint || '';
        if (constraint.includes('code_format')) {
          throw new Error(
            'Invalid code format. Use lowercase letters, digits, and underscores (2-64 characters).'
          );
        }
        if (constraint.includes('name_length')) {
          throw new Error('Name must be between 2 and 100 characters.');
        }
        if (constraint.includes('description_length')) {
          throw new Error('Description must be 500 characters or less.');
        }
        throw new Error(
          'Validation failed. Check the code, name, and description fields.'
        );
      }
      throw new Error(error.message || 'Failed to create sub-category');
    }

    return inserted as LeaveOndutySubCategoryRecord;
  }

  /**
   * Update name/description/sponsor-gate fields of an existing sub-category.
   * Code is intentionally not editable — it's the stable identifier stored on
   * existing application rows.
   */
  static async update(
    id: string,
    data: Partial<
      Pick<
        SubCategoryFormData,
        'name' | 'description' | 'requires_sponsor_approval' | 'sponsor_role_hint'
      >
    >
  ): Promise<LeaveOndutySubCategoryRecord> {
    const supabase = getSupabase();

    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined)
      patch.description = data.description?.trim() || null;
    if (data.requires_sponsor_approval !== undefined)
      patch.requires_sponsor_approval = data.requires_sponsor_approval;
    if (data.sponsor_role_hint !== undefined)
      patch.sponsor_role_hint = data.sponsor_role_hint?.trim() || null;

    const { data: updated, error } = await supabase
      .from('leave_onduty_sub_categories')
      .update(patch)
      .eq('id', id)
      .select('*, institution:institutions(id, name)')
      .single();

    if (error) {
      console.error('[leave-onduty/sub-categories] update failed', error);
      throw new Error(error.message || 'Failed to update sub-category');
    }

    return updated as LeaveOndutySubCategoryRecord;
  }

  /**
   * Toggle active state. Inactive sub-categories stay in the DB but are
   * hidden from dropdowns on new applications.
   */
  static async setActive(id: string, isActive: boolean): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_sub_categories')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      console.error('[leave-onduty/sub-categories] setActive failed', error);
      throw new Error(error.message || 'Failed to update status');
    }
  }

  /**
   * Delete a sub-category. Does not cascade to existing applications —
   * they keep their stored string value in the sub_category column.
   */
  static async delete(id: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_sub_categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[leave-onduty/sub-categories] delete failed', error);
      throw new Error(error.message || 'Failed to delete sub-category');
    }
  }
}
