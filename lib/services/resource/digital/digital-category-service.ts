import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  DigitalResourceCategory,
  DigitalCategoryListResponse
} from '@/types/digital-resources';

export class DigitalCategoryService {
  private static supabase = createClientSupabaseClient();

  static async getDigitalCategories(): Promise<DigitalCategoryListResponse> {
    try {
      const { data, error, count } = await this.supabase
        .from('digital_resource_categories')
        .select('*', { count: 'exact' })
        .order('category_name', { ascending: true });

      if (error) throw error;

      return {
        data: data as DigitalResourceCategory[],
        metadata: {
          total: count || 0,
          page: 1,
          limit: data.length,
          totalPages: 1
        }
      };
    } catch (error) {
      console.error('Error fetching digital resource categories:', error);
      toast.error('Failed to fetch digital resource categories');
      throw error;
    }
  }

  static async getDigitalCategory(
    id: string
  ): Promise<DigitalResourceCategory> {
    try {
      const { data, error } = await this.supabase
        .from('digital_resource_categories')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as DigitalResourceCategory;
    } catch (error) {
      console.error('Error fetching digital resource category:', error);
      toast.error('Failed to fetch digital resource category details');
      throw error;
    }
  }
}
