import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelCategoryFee,
  CreateHostelCategoryFeeDto,
  UpdateHostelCategoryFeeDto,
} from '@/types/hostel-category-fees';

export class HostelCategoryFeeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getFeesByYear(hostelYearId: string): Promise<HostelCategoryFee[]> {
    const { data, error } = await this.supabase
      .from('hostel_category_fees')
      .select('*')
      .eq('hostel_year_id', hostelYearId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('campus-living/category-fees', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch category fees');
    }
    return (data ?? []) as HostelCategoryFee[];
  }

  static async createFee(
    dto: CreateHostelCategoryFeeDto
  ): Promise<HostelCategoryFee> {
    const { data, error } = await this.supabase
      .from('hostel_category_fees')
      .insert([dto])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/category-fees', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.code === '23505'
          ? 'This category already has a fee for the selected hostel year.'
          : error.message || 'Failed to create category fee'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelCategoryFee;
  }

  static async updateFee(
    id: string,
    dto: UpdateHostelCategoryFeeDto
  ): Promise<HostelCategoryFee> {
    const { data, error } = await this.supabase
      .from('hostel_category_fees')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/category-fees', 'Database error updating', error);
      throw new Error(error.message || 'Failed to update category fee');
    }
    return data as HostelCategoryFee;
  }

  static async deleteFee(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_category_fees')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/category-fees', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete category fee');
    }
  }
}
