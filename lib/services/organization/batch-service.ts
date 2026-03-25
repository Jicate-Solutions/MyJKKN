import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface Batch {
  id: string;
  institution_id: string;
  batch_year: string;
  batch_code: string;
  batch_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BatchFilters {
  institution_id?: string;
  isActive?: boolean;
  search?: string;
}

export class BatchService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all batches for an institution
   * @param institutionId - The institution ID
   * @returns Promise<Batch[]> - List of active batches
   */
  static async getBatchesByInstitution(institutionId: string): Promise<Batch[]> {
    try {
      const { data, error } = await this.supabase
        .from('batches')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('batch_year', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching batches by institution:', error);
      throw error;
    }
  }

  /**
   * Get a single batch by ID
   * @param id - The batch ID
   * @returns Promise<Batch | null>
   */
  static async getBatch(id: string): Promise<Batch | null> {
    try {
      const { data, error } = await this.supabase
        .from('batches')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching batch:', error);
      throw error;
    }
  }

  /**
   * Get batches with filters
   * @param filters - Filter options
   * @returns Promise<Batch[]>
   */
  static async getBatches(filters: BatchFilters = {}): Promise<Batch[]> {
    try {
      let query = (this.supabase as any).from('batches').select('*');

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters.search) {
        query = query.or(
          `batch_code.ilike.%${filters.search}%,batch_name.ilike.%${filters.search}%,batch_year.ilike.%${filters.search}%`
        );
      }

      query = query.order('batch_year', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching batches:', error);
      throw error;
    }
  }
}
