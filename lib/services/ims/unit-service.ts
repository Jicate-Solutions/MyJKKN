// lib/services/ims/unit-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsUnit,
  ImsUnitFilters,
  CreateImsUnitDto,
  UpdateImsUnitDto,
} from '@/types/ims';

export class ImsUnitService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List units with optional filtering and pagination.
   */
  static async getUnits(filters: ImsUnitFilters = {}): Promise<{
    data: ImsUnit[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_units')
        .select('*', { count: 'exact' });

      // Search on name or abbreviation
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,abbreviation.ilike.%${filters.search}%`
        );
      }

      // Base unit filter
      if (filters.is_base_unit !== undefined) {
        query = query.eq('is_base_unit', filters.is_base_unit);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsUnit[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsUnitService] Error in getUnits:', error);
      throw error;
    }
  }

  /**
   * Create a new unit.
   */
  static async createUnit(data: CreateImsUnitDto): Promise<ImsUnit> {
    try {
      const { data: unit, error } = await this.supabase
        .from('ims_units')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Unit "${data.name}" already exists`);
        }
        throw error;
      }

      return unit as ImsUnit;
    } catch (error) {
      console.error('[ImsUnitService] Error in createUnit:', error);
      throw error;
    }
  }

  /**
   * Update an existing unit.
   */
  static async updateUnit(id: string, data: UpdateImsUnitDto): Promise<ImsUnit> {
    try {
      const { data: unit, error } = await this.supabase
        .from('ims_units')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return unit as ImsUnit;
    } catch (error) {
      console.error('[ImsUnitService] Error in updateUnit:', error);
      throw error;
    }
  }

  /**
   * Delete a unit by ID.
   */
  static async deleteUnit(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_units')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsUnitService] Error in deleteUnit:', error);
      throw error;
    }
  }

  /**
   * Lightweight unit list for dropdown selects.
   */
  static async getUnitsForSelect(): Promise<
    { id: string; name: string; abbreviation: string }[]
  > {
    try {
      const { data, error } = await this.supabase
        .from('ims_units')
        .select('id, name, abbreviation')
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[ImsUnitService] Error in getUnitsForSelect:', error);
      throw error;
    }
  }
}
