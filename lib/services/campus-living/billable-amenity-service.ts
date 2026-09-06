import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  BillableAmenity,
  CreateBillableAmenityDto,
  UpdateBillableAmenityDto,
  BillableAmenityFilters,
  BillableAmenityListResponse,
  FeeCalculationType,
  RefundMode,
} from '@/types/billable-amenities';

/**
 * DB row shape — `hostel_billable_amenities` uses `active`, not
 * `is_active`. Translated at service boundary. Otherwise 1:1 with DTOs.
 */
interface BillableAmenityRow {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  fee_calculation_type: FeeCalculationType;
  default_config_schema: Record<string, unknown>;
  commitment_months: number;
  late_joiner_min_months: number;
  upfront_required: boolean;
  refund_mode: RefundMode;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToBillableAmenity(row: BillableAmenityRow): BillableAmenity {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon,
    description: row.description,
    fee_calculation_type: row.fee_calculation_type,
    default_config_schema: row.default_config_schema ?? {},
    commitment_months: row.commitment_months,
    late_joiner_min_months: row.late_joiner_min_months,
    upfront_required: row.upfront_required,
    refund_mode: row.refund_mode,
    sort_order: row.sort_order,
    is_active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class BillableAmenityService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getBillableAmenities(
    filters: BillableAmenityFilters = {}
  ): Promise<BillableAmenityListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('hostel_billable_amenities')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.is_active !== undefined) {
      query = query.eq('active', filters.is_active);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('campus-living/billable-amenities', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch billable amenities');
    }

    const total = count ?? 0;
    return {
      data: ((data ?? []) as BillableAmenityRow[]).map(rowToBillableAmenity),
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getActiveBillableAmenities(): Promise<BillableAmenity[]> {
    const { data, error } = await this.supabase
      .from('hostel_billable_amenities')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/billable-amenities', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active billable amenities');
    }
    return ((data ?? []) as BillableAmenityRow[]).map(rowToBillableAmenity);
  }

  static async getBillableAmenityById(id: string): Promise<BillableAmenity> {
    const { data, error } = await this.supabase
      .from('hostel_billable_amenities')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error('campus-living/billable-amenities', 'Database error fetching one', error);
      throw new Error(error.message || 'Failed to fetch billable amenity');
    }
    return rowToBillableAmenity(data as BillableAmenityRow);
  }

  static async createBillableAmenity(
    dto: CreateBillableAmenityDto
  ): Promise<BillableAmenity> {
    const insertRow: Partial<BillableAmenityRow> = {
      code: dto.code,
      name: dto.name,
      icon: dto.icon ?? null,
      description: dto.description ?? null,
      fee_calculation_type: dto.fee_calculation_type,
      default_config_schema: dto.default_config_schema ?? {},
      commitment_months: dto.commitment_months ?? 12,
      late_joiner_min_months: dto.late_joiner_min_months ?? 6,
      upfront_required: dto.upfront_required ?? true,
      refund_mode: dto.refund_mode ?? 'credit_to_next',
      sort_order: dto.sort_order ?? 0,
      active: dto.is_active ?? true,
    };

    const { data, error } = await this.supabase
      .from('hostel_billable_amenities')
      .insert([insertRow])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/billable-amenities', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create billable amenity'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return rowToBillableAmenity(data as BillableAmenityRow);
  }

  static async updateBillableAmenity(
    id: string,
    dto: UpdateBillableAmenityDto
  ): Promise<BillableAmenity> {
    const updateRow: Partial<BillableAmenityRow> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updateRow.name = dto.name;
    if (dto.icon !== undefined) updateRow.icon = dto.icon;
    if (dto.description !== undefined) updateRow.description = dto.description;
    if (dto.fee_calculation_type !== undefined)
      updateRow.fee_calculation_type = dto.fee_calculation_type;
    if (dto.default_config_schema !== undefined)
      updateRow.default_config_schema = dto.default_config_schema;
    if (dto.commitment_months !== undefined)
      updateRow.commitment_months = dto.commitment_months;
    if (dto.late_joiner_min_months !== undefined)
      updateRow.late_joiner_min_months = dto.late_joiner_min_months;
    if (dto.upfront_required !== undefined)
      updateRow.upfront_required = dto.upfront_required;
    if (dto.refund_mode !== undefined) updateRow.refund_mode = dto.refund_mode;
    if (dto.sort_order !== undefined) updateRow.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) updateRow.active = dto.is_active;

    const { data, error } = await this.supabase
      .from('hostel_billable_amenities')
      .update(updateRow)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/billable-amenities', 'Database error updating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update billable amenity'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return rowToBillableAmenity(data as BillableAmenityRow);
  }

  static async deleteBillableAmenity(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_billable_amenities')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/billable-amenities', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete billable amenity');
    }
  }

  static async bulkDeleteBillableAmenities(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteBillableAmenity(id);
        success.push(id);
      } catch (e) {
        logger.error('campus-living/billable-amenities', `Error deleting ${id}`, e);
        failed.push({
          id,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }
    return { success, failed };
  }
}
