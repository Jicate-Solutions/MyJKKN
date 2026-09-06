import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelPmTask,
  HostelPmTaskStatus,
  CompleteHostelPmTaskDTO,
} from '@/types/campus-living/community';

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

  // ── PM Tasks (added 2026-05-20 by Agent ξ — additive) ──────────────────
  //
  // Backs /campus-living/maintenance/preventive/tasks. Reads from
  // `hostel_pm_tasks` (existing on prod). Tasks are auto-generated rows
  // produced by an upstream scheduler from each active schedule; this
  // service is read-mostly with a single `completeTask` write path.

  /**
   * List preventive-maintenance tasks for an institution. Filters: status
   * (single or array), schedule_id, block_id, search (matches title).
   * Orders by due_date ascending so overdue/today bubble to the top.
   */
  static async getTasks(
    institutionId: string | undefined,
    filters?: {
      status?: HostelPmTaskStatus | HostelPmTaskStatus[];
      schedule_id?: string;
      block_id?: string | null;
      search?: string;
    },
  ): Promise<HostelPmTask[]> {
    if (!institutionId) return [];
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('hostel_pm_tasks')
        .select('*')
        .eq('institution_id', institutionId);

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }
      if (filters?.schedule_id) query = query.eq('schedule_id', filters.schedule_id);
      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }
      query = query.order('due_date', { ascending: true, nullsFirst: false });

      const { data, error } = await query;
      if (error) {
        logger.error(
          'campus-living/preventive-maintenance',
          'Failed to fetch PM tasks',
          error,
        );
        throw error;
      }
      return (data ?? []) as HostelPmTask[];
    } catch (error) {
      logger.error(
        'campus-living/preventive-maintenance',
        'Unexpected error in getTasks',
        error,
      );
      throw error;
    }
  }

  /**
   * Complete a PM task — sets status='resolved', stamps completed_by +
   * completed_at, optionally records completion_notes, photo_urls, and
   * cost_actual. Returns the updated row.
   */
  static async completeTask(
    id: string,
    completedBy: string | null,
    payload: CompleteHostelPmTaskDTO,
  ): Promise<HostelPmTask> {
    try {
      const supabase = createClientSupabaseClient();
      const body: Record<string, unknown> = {
        status: 'resolved',
        completed_by: completedBy,
        completed_at: new Date().toISOString(),
        completion_notes: payload.completion_notes ?? null,
        photo_urls: payload.photo_urls ?? null,
        cost_actual: payload.cost_actual ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('hostel_pm_tasks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(body as any)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error(
          'campus-living/preventive-maintenance',
          'Failed to complete PM task',
          error,
        );
        throw error;
      }
      return data as HostelPmTask;
    } catch (error) {
      logger.error(
        'campus-living/preventive-maintenance',
        'Unexpected error in completeTask',
        error,
      );
      throw error;
    }
  }
}
