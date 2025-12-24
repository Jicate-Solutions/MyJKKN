import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface Regulation {
  id: string;
  institution_id: string;
  regulation_year: string;
  regulation_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegulationFilters {
  institution_id?: string;
  isActive?: boolean;
  search?: string;
}

export class RegulationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all regulations for an institution
   * @param institutionId - The institution ID
   * @returns Promise<Regulation[]> - List of active regulations
   */
  static async getRegulationsByInstitution(
    institutionId: string
  ): Promise<Regulation[]> {
    try {
      const { data, error } = await this.supabase
        .from('regulations')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('regulation_year', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching regulations by institution:', error);
      throw error;
    }
  }

  /**
   * Get a single regulation by ID
   * @param id - The regulation ID
   * @returns Promise<Regulation | null>
   */
  static async getRegulation(id: string): Promise<Regulation | null> {
    try {
      const { data, error } = await this.supabase
        .from('regulations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching regulation:', error);
      throw error;
    }
  }

  /**
   * Get regulations with filters
   * @param filters - Filter options
   * @returns Promise<Regulation[]>
   */
  static async getRegulations(
    filters: RegulationFilters = {}
  ): Promise<Regulation[]> {
    try {
      let query = (this.supabase as any).from('regulations').select('*');

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters.search) {
        query = query.or(
          `regulation_code.ilike.%${filters.search}%,regulation_year.ilike.%${filters.search}%`
        );
      }

      query = query.order('regulation_year', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching regulations:', error);
      throw error;
    }
  }
}
