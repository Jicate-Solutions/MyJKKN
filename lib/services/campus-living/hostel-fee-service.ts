import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelFee,
  CreateHostelFeeDto,
  UpdateHostelFeeDto,
} from '@/types/hostel-fees';

// Unified hostel fees (room / mess / package targets). Renamed from
// HostelCategoryFeeService; reads/writes the `hostel_fees` table.
export class HostelFeeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getFeesByYear(hostelYearId: string): Promise<HostelFee[]> {
    const { data, error } = await this.supabase
      .from('hostel_fees')
      .select('*')
      .eq('hostel_year_id', hostelYearId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('campus-living/hostel-fees', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch hostel fees');
    }
    return (data ?? []) as HostelFee[];
  }

  /** All package-targeted fee rows across every hostel year (Package Fees tab). */
  static async getPackageFees(): Promise<HostelFee[]> {
    const { data, error } = await this.supabase
      .from('hostel_fees')
      .select('*')
      .not('package_id', 'is', null)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('campus-living/hostel-fees', 'Database error listing package fees', error);
      throw new Error(error.message || 'Failed to fetch package fees');
    }
    return (data ?? []) as HostelFee[];
  }

  static async createFee(dto: CreateHostelFeeDto): Promise<HostelFee> {
    const { data, error } = await this.supabase
      .from('hostel_fees')
      .insert([dto])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/hostel-fees', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.code === '23505'
          ? 'A fee already exists for this category/package and hostel year.'
          : error.message || 'Failed to create hostel fee'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelFee;
  }

  static async updateFee(id: string, dto: UpdateHostelFeeDto): Promise<HostelFee> {
    const { data, error } = await this.supabase
      .from('hostel_fees')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/hostel-fees', 'Database error updating', error);
      throw new Error(error.message || 'Failed to update hostel fee');
    }
    return data as HostelFee;
  }

  static async deleteFee(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_fees')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/hostel-fees', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete hostel fee');
    }
  }
}
