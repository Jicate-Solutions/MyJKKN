// ============================================================================
// Parent Portal Access Service
// Handles CRUD operations for admin-managed parent access codes
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  ParentPortalAccess,
  CreateParentAccessDto,
  UpdateParentAccessDto,
  ParentAccessFilters,
  ParentAccessListResponse,
  ParentAccessStats,
  AccessRelationship,
  AccessLevel,
} from '@/types/parent-portal';

export class ParentAccessService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Generate a unique 8-character alphanumeric access code
   * SECURITY: Uses crypto.randomBytes for cryptographically secure random values
   */
  static generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
    const crypto = require('crypto');
    let code = '';
    const randomBytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(randomBytes[i] % chars.length);
    }
    return code;
  }

  /**
   * Sanitize search input
   */
  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    return input.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Get all parent access records with filters and pagination
   */
  static async getAccessRecords(
    filters: ParentAccessFilters
  ): Promise<ParentAccessListResponse> {
    try {
      const supabase: any = this.getSupabase();
      const { page = 1, limit = 20 } = filters;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('parent_portal_access')
        .select('*', { count: 'exact' });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.search) {
        const sanitized = this.sanitizeSearch(filters.search);
        query = query.or(
          `parent_name.ilike.%${sanitized}%,parent_email.ilike.%${sanitized}%,parent_phone.ilike.%${sanitized}%,access_code.ilike.%${sanitized}%`
        );
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.relationship) {
        query = query.eq('relationship', filters.relationship);
      }

      if (filters.learner_id) {
        query = query.eq('learner_id', filters.learner_id);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      console.error('[parent-portal/access] Error fetching records:', error);
      throw error;
    }
  }

  /**
   * Get single access record by ID
   */
  static async getAccessById(id: string): Promise<ParentPortalAccess | null> {
    try {
      const supabase: any = this.getSupabase();
      const { data, error } = await supabase
        .from('parent_portal_access')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('[parent-portal/access] Error fetching record:', error);
      throw error;
    }
  }

  /**
   * Create new parent access with auto-generated code
   */
  static async createAccess(
    input: CreateParentAccessDto
  ): Promise<ParentPortalAccess> {
    try {
      const supabase: any = this.getSupabase();

      // Generate unique access code (retry up to 5 times on collision)
      let accessCode = this.generateAccessCode();
      let attempts = 0;
      while (attempts < 5) {
        const { data: existing } = await supabase
          .from('parent_portal_access')
          .select('id')
          .eq('access_code', accessCode)
          .maybeSingle();

        if (!existing) break;
        accessCode = this.generateAccessCode();
        attempts++;
      }

      const insertData = {
        institution_id: input.institution_id,
        learner_id: input.learner_id,
        parent_name: input.parent_name,
        parent_email: input.parent_email || null,
        parent_phone: input.parent_phone || null,
        relationship: input.relationship || 'parent',
        access_code: accessCode,
        access_level: input.access_level || 'view',
        is_active: true,
        login_count: 0,
        notification_preferences: {
          email: input.notification_preferences?.email ?? true,
          sms: input.notification_preferences?.sms ?? false,
          push: input.notification_preferences?.push ?? false,
        },
      };

      const { data, error } = await supabase
        .from('parent_portal_access')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast.success('Parent access created successfully');
      return data;
    } catch (error) {
      console.error('[parent-portal/access] Error creating access:', error);
      toast.error('Failed to create parent access');
      throw error;
    }
  }

  /**
   * Update parent access record
   */
  static async updateAccess(
    id: string,
    input: UpdateParentAccessDto
  ): Promise<ParentPortalAccess> {
    try {
      const supabase: any = this.getSupabase();

      const updateData: Record<string, unknown> = {};

      if (input.parent_name !== undefined) updateData.parent_name = input.parent_name;
      if (input.parent_email !== undefined) updateData.parent_email = input.parent_email;
      if (input.parent_phone !== undefined) updateData.parent_phone = input.parent_phone;
      if (input.relationship !== undefined) updateData.relationship = input.relationship;
      if (input.access_level !== undefined) updateData.access_level = input.access_level;
      if (input.is_active !== undefined) updateData.is_active = input.is_active;

      if (input.notification_preferences) {
        // Merge with existing preferences
        const { data: current } = await supabase
          .from('parent_portal_access')
          .select('notification_preferences')
          .eq('id', id)
          .single();

        updateData.notification_preferences = {
          ...(current?.notification_preferences || {}),
          ...input.notification_preferences,
        };
      }

      const { data, error } = await supabase
        .from('parent_portal_access')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Parent access updated successfully');
      return data;
    } catch (error) {
      console.error('[parent-portal/access] Error updating access:', error);
      toast.error('Failed to update parent access');
      throw error;
    }
  }

  /**
   * Toggle active status
   */
  static async toggleActive(id: string, isActive: boolean): Promise<ParentPortalAccess> {
    return this.updateAccess(id, { is_active: isActive });
  }

  /**
   * Regenerate access code for existing record
   */
  static async regenerateAccessCode(id: string): Promise<ParentPortalAccess> {
    try {
      const supabase: any = this.getSupabase();
      const newCode = this.generateAccessCode();

      const { data, error } = await supabase
        .from('parent_portal_access')
        .update({ access_code: newCode })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Access code regenerated');
      return data;
    } catch (error) {
      console.error('[parent-portal/access] Error regenerating code:', error);
      toast.error('Failed to regenerate access code');
      throw error;
    }
  }

  /**
   * Delete parent access record
   */
  static async deleteAccess(id: string): Promise<void> {
    try {
      const supabase: any = this.getSupabase();
      const { error } = await supabase
        .from('parent_portal_access')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Parent access deleted');
    } catch (error) {
      console.error('[parent-portal/access] Error deleting access:', error);
      toast.error('Failed to delete parent access');
      throw error;
    }
  }

  /**
   * Get access statistics for an institution
   */
  static async getAccessStats(institutionId: string): Promise<ParentAccessStats> {
    try {
      const supabase: any = this.getSupabase();

      const { data: records, error } = await supabase
        .from('parent_portal_access')
        .select('is_active, relationship, access_level, last_login_at')
        .eq('institution_id', institutionId);

      if (error) throw error;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stats: ParentAccessStats = {
        total_access_records: records?.length || 0,
        active_count: 0,
        inactive_count: 0,
        by_relationship: { parent: 0, guardian: 0, sponsor: 0 },
        by_access_level: { view: 0, interact: 0 },
        recently_active: 0,
      };

      (records || []).forEach((r: any) => {
        if (r.is_active) {
          stats.active_count++;
        } else {
          stats.inactive_count++;
        }

        const rel = r.relationship as AccessRelationship;
        if (rel && stats.by_relationship[rel] !== undefined) {
          stats.by_relationship[rel]++;
        }

        const level = r.access_level as AccessLevel;
        if (level && stats.by_access_level[level] !== undefined) {
          stats.by_access_level[level]++;
        }

        if (r.last_login_at && new Date(r.last_login_at) > thirtyDaysAgo) {
          stats.recently_active++;
        }
      });

      return stats;
    } catch (error) {
      console.error('[parent-portal/access] Error fetching stats:', error);
      throw error;
    }
  }
}
