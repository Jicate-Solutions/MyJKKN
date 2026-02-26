// lib/services/ims/store-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsStore,
  ImsStoreWithRelations,
  ImsStoreFilters,
  CreateImsStoreDto,
  UpdateImsStoreDto,
} from '@/types/ims';

export class ImsStoreService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List stores with pagination and filtering.
   * Joins institution name and manager name.
   */
  static async getStores(filters: ImsStoreFilters = {}): Promise<{
    data: ImsStoreWithRelations[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_stores')
        .select(
          '*, manager:profiles!ims_stores_manager_id_fkey(id, full_name)',
          { count: 'exact' }
        );

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsStoreWithRelations[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsStoreService] Error in getStores:', error);
      throw error;
    }
  }

  /**
   * Get a single store by ID with relations.
   */
  static async getStore(id: string): Promise<ImsStoreWithRelations> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .select(
          '*, manager:profiles!ims_stores_manager_id_fkey(id, full_name)'
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return data as ImsStoreWithRelations;
    } catch (error) {
      console.error('[ImsStoreService] Error in getStore:', error);
      throw error;
    }
  }

  /**
   * Create a new store. Catches duplicate code violations.
   */
  static async createStore(data: CreateImsStoreDto): Promise<ImsStore> {
    try {
      const { data: store, error } = await this.supabase
        .from('ims_stores')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Store code "${data.code}" already exists`);
        }
        throw error;
      }

      return store as ImsStore;
    } catch (error) {
      console.error('[ImsStoreService] Error in createStore:', error);
      throw error;
    }
  }

  /**
   * Update an existing store.
   * Non-super-admins have sensitive fields (GSTIN, UPI, receipt branding)
   * stripped server-side as a defense-in-depth guard.
   */
  static async updateStore(
    id: string,
    data: UpdateImsStoreDto
  ): Promise<ImsStore> {
    try {
      const updateData = { ...data };

      // Derive isSuperAdmin from the database — never trust a caller-supplied value.
      const { data: { user } } = await this.supabase.auth.getUser();
      const userId = user?.id;
      let isSuperAdmin = false;
      if (userId) {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        isSuperAdmin = profile?.role === 'super_admin';
      }

      // Strip sensitive fields for non-super-admins
      if (!isSuperAdmin) {
        delete updateData.gstin;
        delete updateData.upi_vpa;
        delete updateData.upi_merchant_name;
        delete updateData.receipt_header;
        delete updateData.receipt_footer;
      }

      const { data: store, error } = await this.supabase
        .from('ims_stores')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return store as ImsStore;
    } catch (error) {
      console.error('[ImsStoreService] Error in updateStore:', error);
      throw error;
    }
  }

  /**
   * Delete a store by ID.
   */
  static async deleteStore(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_stores')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsStoreService] Error in deleteStore:', error);
      throw error;
    }
  }

  /**
   * Toggle store active/inactive status.
   */
  static async toggleStoreActive(id: string, is_active: boolean): Promise<ImsStore> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsStore;
    } catch (error) {
      console.error('[ImsStoreService] Error in toggleStoreActive:', error);
      throw error;
    }
  }

  /**
   * Lightweight store list for the switcher dropdown.
   * - Super admin: returns all active stores
   * - Regular user: returns stores matching their institution_id
   */
  static async getStoresForSelect(
    institutionId?: string | null,
    isSuperAdmin?: boolean
  ): Promise<{ id: string; name: string; code: string; institution_id: string | null }[]> {
    try {
      let query = this.supabase
        .from('ims_stores')
        .select('id, name, code, institution_id')
        .eq('is_active', true)
        .order('name');

      // Non-super-admins only see their own institution's store(s)
      if (!isSuperAdmin && institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoresForSelect:', error);
      throw error;
    }
  }

  /**
   * Find the first active store for a specific institution.
   * Backward-compatible — returns single store or null.
   */
  static async getStoreByInstitution(
    institutionId: string
  ): Promise<ImsStore | null> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data as ImsStore | null;
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoreByInstitution:', error);
      throw error;
    }
  }

  /**
   * Get ALL active stores for an institution (multi-store support).
   */
  static async getStoresByInstitution(
    institutionId: string
  ): Promise<ImsStore[]> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []) as ImsStore[];
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoresByInstitution:', error);
      throw error;
    }
  }
}
