// lib/services/ims/supplier-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsSupplier,
  ImsSupplierFilters,
  CreateImsSupplierDto,
  UpdateImsSupplierDto,
} from '@/types/ims';

export class ImsSupplierService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List suppliers with pagination and filtering.
   */
  static async getSuppliers(filters: ImsSupplierFilters = {}): Promise<{
    data: ImsSupplier[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_suppliers')
        .select('*', { count: 'exact' });

      // Search on name, code, or contact_person
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%,contact_person.ilike.%${filters.search}%`
        );
      }

      // Active filter
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsSupplier[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsSupplierService] Error in getSuppliers:', error);
      throw error;
    }
  }

  /**
   * Create a new supplier.
   */
  static async createSupplier(data: CreateImsSupplierDto): Promise<ImsSupplier> {
    try {
      const { data: supplier, error } = await this.supabase
        .from('ims_suppliers')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Supplier code "${data.code}" already exists`);
        }
        throw error;
      }

      return supplier as ImsSupplier;
    } catch (error) {
      console.error('[ImsSupplierService] Error in createSupplier:', error);
      throw error;
    }
  }

  /**
   * Update an existing supplier.
   */
  static async updateSupplier(
    id: string,
    data: UpdateImsSupplierDto
  ): Promise<ImsSupplier> {
    try {
      const { data: supplier, error } = await this.supabase
        .from('ims_suppliers')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return supplier as ImsSupplier;
    } catch (error) {
      console.error('[ImsSupplierService] Error in updateSupplier:', error);
      throw error;
    }
  }

  /**
   * Delete a supplier by ID.
   */
  static async deleteSupplier(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsSupplierService] Error in deleteSupplier:', error);
      throw error;
    }
  }

  /**
   * Toggle supplier active/inactive status.
   */
  static async toggleSupplierActive(
    id: string,
    is_active: boolean
  ): Promise<ImsSupplier> {
    try {
      const { data, error } = await this.supabase
        .from('ims_suppliers')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsSupplier;
    } catch (error) {
      console.error('[ImsSupplierService] Error in toggleSupplierActive:', error);
      throw error;
    }
  }

  /**
   * Lightweight supplier list for dropdown selects.
   */
  static async getSuppliersForSelect(
    storeId: string,
    institutionId?: string
  ): Promise<{ id: string; name: string; code: string; gstin: string | null }[]> {
    try {
      let query = this.supabase
        .from('ims_suppliers')
        .select('id, name, code, gstin')
        .eq('is_active', true)
        .order('name');

      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[ImsSupplierService] Error in getSuppliersForSelect:', error);
      throw error;
    }
  }
}
