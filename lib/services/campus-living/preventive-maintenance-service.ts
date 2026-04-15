import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Row shape surfaced by PreventiveMaintenanceService — joins the underlying
 * `resource_maintenance_schedules` row with enough of the parent `resources`
 * record to display location + resource name on the page. Typed loosely so
 * we don't fight Supabase's deep generics for nested selects.
 */
export interface PreventiveMaintenanceSchedule {
  id: string;
  resource_id: string;
  maintenance_type: string;
  frequency_days: number;
  last_maintenance_date?: string | null;
  next_maintenance_date: string | null;
  is_active?: boolean | null;
  reminder_days_before?: number | null;
  assigned_to_user_id?: string | null;
  description?: string | null;
  estimated_cost?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  resource?: {
    id: string;
    name: string;
    resource_code?: string | null;
    block_number?: string | null;
    room_number?: string | null;
    floor_number?: string | null;
    parent_category_id?: string | null;
  } | null;
  [k: string]: unknown;
}

export class PreventiveMaintenanceService {
  static async getHostelInfraCategoryId(): Promise<string | null> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('resource_parent_categories')
        .select('id')
        .eq('name', 'Hostel Infrastructure')
        .maybeSingle();

      if (error) {
        logger.error(
          'campus-living/preventive-maintenance',
          'Failed to resolve Hostel Infrastructure category id',
          error,
        );
        throw error;
      }
      return data?.id ?? null;
    } catch (error) {
      logger.error(
        'campus-living/preventive-maintenance',
        'Unexpected error in getHostelInfraCategoryId',
        error,
      );
      throw error;
    }
  }

  /**
   * List preventive-maintenance schedules whose parent resource lives under
   * the Hostel Infrastructure category. Results are ordered by next due date
   * ascending, nulls last. We fetch ids of hostel resources first, then
   * schedules — this keeps the query simple and side-steps Supabase
   * join-filter quirks.
   */
  static async getSchedules(
    institutionId?: string,
  ): Promise<PreventiveMaintenanceSchedule[]> {
    try {
      const parentId = await this.getHostelInfraCategoryId();
      if (!parentId) return [];

      const supabase = createClientSupabaseClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resourceQuery: any = supabase
        .from('resources')
        .select(
          `id, name, resource_code, block_number, room_number, floor_number, parent_category_id`,
        )
        .eq('parent_category_id', parentId);
      if (institutionId) {
        resourceQuery = resourceQuery.eq('institution_id', institutionId);
      }
      const { data: resources, error: resErr } = await resourceQuery;
      if (resErr) {
        logger.error(
          'campus-living/preventive-maintenance',
          'Failed to fetch hostel resources',
          resErr,
        );
        throw resErr;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resourceList: any[] = resources ?? [];
      const ids: string[] = resourceList.map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return [];

      const resourceById: Record<string, PreventiveMaintenanceSchedule['resource']> = {};
      for (const r of resourceList) {
        resourceById[r.id] = r;
      }

      const supabase2 = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase2 as any)
        .from('resource_maintenance_schedules')
        .select('*')
        .in('resource_id', ids)
        .order('next_maintenance_date', { ascending: true, nullsFirst: false });

      if (error) {
        logger.error(
          'campus-living/preventive-maintenance',
          'Failed to fetch maintenance schedules',
          error,
        );
        throw error;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = data ?? [];
      return rows.map((row) => ({
        ...row,
        resource: resourceById[row.resource_id] ?? null,
      })) as PreventiveMaintenanceSchedule[];
    } catch (error) {
      logger.error(
        'campus-living/preventive-maintenance',
        'Unexpected error in getSchedules',
        error,
      );
      throw error;
    }
  }
}
