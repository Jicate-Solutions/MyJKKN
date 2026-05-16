// lib/services/resource-management/maintenance-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  logActivityForCurrentUser,
  ResourceManagementActivityTemplates,
} from '@/lib/utils/activity-logger-client';
import type {
  MaintenanceLog,
  MaintenanceSchedule,
  MaintenanceLogFilters,
  MaintenanceScheduleFilters,
  CreateMaintenanceLogDto,
  UpdateMaintenanceLogDto,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceScheduleDto,
  MaintenanceStats,
  MaintenanceStatus
} from '@/types/maintenance';

class MaintenanceService {
  private supabase = createClientSupabaseClient();

  /**
   * Helper: fetch a resource's name by id for activity logging.
   * Falls back to empty string if not found / on error.
   */
  private async getResourceName(resourceId?: string | null): Promise<string> {
    if (!resourceId) return '';
    try {
      const { data } = await this.supabase
        .from('resources')
        .select('name')
        .eq('id', resourceId)
        .maybeSingle();
      return (data as any)?.name ?? '';
    } catch {
      return '';
    }
  }

  // ==================== MAINTENANCE LOGS ====================

  /**
   * Get all maintenance logs with optional filters
   */
  async getMaintenanceLogs(
    filters?: MaintenanceLogFilters
  ): Promise<MaintenanceLog[]> {
    let query = this.supabase
      .from('resource_maintenance_logs')
      .select(
        `
        *,
        resource:resources(id, name, resource_code),
        assigned_to:profiles!assigned_to_user_id(id, full_name, email),
        created_by_user:profiles!created_by(id, full_name, email)
      `
      )
      .order('scheduled_date', { ascending: false });

    if (filters?.resource_id) {
      query = query.eq('resource_id', filters.resource_id);
    }
    if (filters?.maintenance_type) {
      query = query.eq('maintenance_type', filters.maintenance_type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters?.assigned_to_user_id) {
      query = query.eq('assigned_to_user_id', filters.assigned_to_user_id);
    }
    if (filters?.date_from) {
      query = query.gte('scheduled_date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('scheduled_date', filters.date_to);
    }
    if (filters?.search_query) {
      query = query.or(
        `title.ilike.%${filters.search_query}%,description.ilike.%${filters.search_query}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MaintenanceService] Error fetching logs:', error);
      throw error;
    }
    return (data || []) as MaintenanceLog[];
  }

  /**
   * Get a single maintenance log by ID
   */
  async getMaintenanceLogById(id: string): Promise<MaintenanceLog> {
    const { data, error } = await this.supabase
      .from('resource_maintenance_logs')
      .select(
        `
        *,
        resource:resources(id, name, resource_code, parent_category_id, subcategory_id),
        assigned_to:profiles!assigned_to_user_id(id, full_name, email, phone_number),
        created_by_user:profiles!created_by(id, full_name, email)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[MaintenanceService] Error fetching log:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }

    if (!data) {
      console.error('[MaintenanceService] No data found for ID:', id);
      throw new Error('Maintenance log not found');
    }

    console.log('[MaintenanceService] Successfully fetched log:', (data as any).id, (data as any).title);
    return data as MaintenanceLog;
  }

  /**
   * Create a new maintenance log
   */
  async createMaintenanceLog(
    dto: CreateMaintenanceLogDto,
    userId: string
  ): Promise<MaintenanceLog> {
    const { data, error } = await this.supabase
      .from('resource_maintenance_logs')
      .insert({
        ...dto,
        status: 'scheduled' as MaintenanceStatus,
        created_by: userId
      } as any)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService] Error creating log:', error);
      throw error;
    }
    const log = data as MaintenanceLog;
    const resourceName = await this.getResourceName((log as any).resource_id);
    const tpl = ResourceManagementActivityTemplates.maintenanceLogCreated(
      resourceName,
      (log as any).maintenance_type ?? 'general'
    );
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: (log as any).id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_log_id: (log as any).id,
        resource_id: (log as any).resource_id,
      },
    });
    return log;
  }

  /**
   * Update a maintenance log
   */
  async updateMaintenanceLog(
    id: string,
    dto: UpdateMaintenanceLogDto
  ): Promise<MaintenanceLog> {
    const query: any = this.supabase
      .from('resource_maintenance_logs');

    const { data, error } = await query
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService] Error updating log:', error);
      throw error;
    }
    const log = data as MaintenanceLog;
    const resourceName = await this.getResourceName((log as any).resource_id);
    const tpl = ResourceManagementActivityTemplates.maintenanceLogUpdated(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: (log as any).id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_log_id: (log as any).id,
        resource_id: (log as any).resource_id,
      },
    });
    return log;
  }

  /**
   * Complete a maintenance log
   */
  async completeMaintenanceLog(
    id: string,
    completionData: {
      completed_date: string;
      notes?: string;
      cost?: number;
    }
  ): Promise<MaintenanceLog> {
    const query: any = this.supabase
      .from('resource_maintenance_logs');

    const { data, error } = await query
      .update({
        ...completionData,
        status: 'completed' as MaintenanceStatus
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService] Error completing log:', error);
      throw error;
    }
    const log = data as MaintenanceLog;
    const resourceName = await this.getResourceName((log as any).resource_id);
    const tpl = ResourceManagementActivityTemplates.maintenanceLogCompleted(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: (log as any).id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_log_id: (log as any).id,
        resource_id: (log as any).resource_id,
      },
    });
    return log;
  }

  /**
   * Cancel a maintenance log
   */
  async cancelMaintenanceLog(
    id: string,
    reason?: string
  ): Promise<MaintenanceLog> {
    const query: any = this.supabase
      .from('resource_maintenance_logs');

    const { data, error } = await query
      .update({
        status: 'cancelled' as MaintenanceStatus,
        notes: reason
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService] Error cancelling log:', error);
      throw error;
    }
    const log = data as MaintenanceLog;
    const resourceName = await this.getResourceName((log as any).resource_id);
    const tpl = ResourceManagementActivityTemplates.maintenanceLogCancelled(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: (log as any).id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_log_id: (log as any).id,
        resource_id: (log as any).resource_id,
      },
    });
    return log;
  }

  /**
   * Delete a maintenance log
   */
  async deleteMaintenanceLog(id: string): Promise<void> {
    // Fetch the log first to capture resource info for logging
    const { data: existing } = await this.supabase
      .from('resource_maintenance_logs')
      .select('id, resource_id')
      .eq('id', id)
      .maybeSingle();
    const resourceId = (existing as any)?.resource_id;
    const resourceName = await this.getResourceName(resourceId);

    const { error } = await this.supabase
      .from('resource_maintenance_logs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MaintenanceService] Error deleting log:', error);
      throw error;
    }
    const tpl = ResourceManagementActivityTemplates.maintenanceLogDeleted(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_log_id: id,
        resource_id: resourceId,
      },
    });
  }

  // ==================== MAINTENANCE SCHEDULES ====================

  /**
   * Get all maintenance schedules
   */
  async getMaintenanceSchedules(
    filters?: MaintenanceScheduleFilters
  ): Promise<MaintenanceSchedule[]> {
    let query = this.supabase
      .from('resource_maintenance_schedules')
      .select(
        `
        *,
        resource:resources(id, name, resource_code),
        assigned_to:profiles!assigned_to_user_id(id, full_name, email)
      `
      )
      .order('next_maintenance_date', { ascending: true });

    if (filters?.resource_id) {
      query = query.eq('resource_id', filters.resource_id);
    }
    if (filters?.maintenance_type) {
      query = query.eq('maintenance_type', filters.maintenance_type);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.assigned_to_user_id) {
      query = query.eq('assigned_to_user_id', filters.assigned_to_user_id);
    }
    if (filters?.overdue_only) {
      const today = new Date().toISOString().split('T')[0];
      query = query.lt('next_maintenance_date', today).eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MaintenanceService] Error fetching schedules:', error);
      throw error;
    }
    return (data || []) as MaintenanceSchedule[];
  }

  /**
   * Get a single maintenance schedule
   */
  async getMaintenanceScheduleById(id: string): Promise<MaintenanceSchedule> {
    const { data, error } = await this.supabase
      .from('resource_maintenance_schedules')
      .select(
        `
        *,
        resource:resources(*),
        assigned_to:profiles!assigned_to_user_id(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[MaintenanceService] Error fetching schedule:', error);
      throw error;
    }
    return data as MaintenanceSchedule;
  }

  /**
   * Create a maintenance schedule
   */
  async createMaintenanceSchedule(
    dto: CreateMaintenanceScheduleDto
  ): Promise<MaintenanceSchedule> {
    const { data, error } = await this.supabase
      .from('resource_maintenance_schedules')
      .insert({
        ...dto,
        is_active: true
      } as any)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService] Error creating schedule:', error);
      throw error;
    }
    const schedule = data as MaintenanceSchedule;
    const resourceName = await this.getResourceName((schedule as any).resource_id);
    const tpl = ResourceManagementActivityTemplates.maintenanceScheduleCreated(
      resourceName,
      (schedule as any).frequency ?? 'periodic'
    );
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: (schedule as any).id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_schedule_id: (schedule as any).id,
        resource_id: (schedule as any).resource_id,
      },
    });
    return schedule;
  }

  /**
   * Update a maintenance schedule
   */
  async updateMaintenanceSchedule(
    id: string,
    dto: UpdateMaintenanceScheduleDto
  ): Promise<MaintenanceSchedule> {
    const query: any = this.supabase
      .from('resource_maintenance_schedules');

    const { data, error } = await query
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaintenanceService] Error updating schedule:', error);
      throw error;
    }
    const schedule = data as MaintenanceSchedule;
    const resourceName = await this.getResourceName((schedule as any).resource_id);
    const tpl = ResourceManagementActivityTemplates.maintenanceScheduleUpdated(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: (schedule as any).id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_schedule_id: (schedule as any).id,
        resource_id: (schedule as any).resource_id,
      },
    });
    return schedule;
  }

  /**
   * Delete a maintenance schedule
   */
  async deleteMaintenanceSchedule(id: string): Promise<void> {
    // Fetch the schedule first to capture resource info for logging
    const { data: existing } = await this.supabase
      .from('resource_maintenance_schedules')
      .select('id, resource_id')
      .eq('id', id)
      .maybeSingle();
    const resourceId = (existing as any)?.resource_id;
    const resourceName = await this.getResourceName(resourceId);

    const { error } = await this.supabase
      .from('resource_maintenance_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MaintenanceService] Error deleting schedule:', error);
      throw error;
    }
    const tpl = ResourceManagementActivityTemplates.maintenanceScheduleDeleted(resourceName);
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      resourceId: id,
      resourceName,
      description: tpl.description,
      metadata: {
        sub_type: tpl.sub_type,
        maintenance_schedule_id: id,
        resource_id: resourceId,
      },
    });
  }

  // ==================== ANALYTICS ====================

  /**
   * Get maintenance statistics
   */
  async getMaintenanceStats(resourceId?: string): Promise<MaintenanceStats> {
    let query = this.supabase
      .from('resource_maintenance_logs')
      .select('*');

    if (resourceId) {
      query = query.eq('resource_id', resourceId);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('[MaintenanceService] Error fetching stats:', error);
      throw error;
    }

    const total = logs?.length || 0;
    const completed =
      logs?.filter((l: any) => l.status === 'completed').length || 0;
    const pending =
      logs?.filter(
        (l: any) => l.status === 'scheduled' || l.status === 'in_progress'
      ).length || 0;

    const today = new Date();
    const overdue =
      logs?.filter(
        (l: any) =>
          (l.status === 'scheduled' || l.status === 'in_progress') &&
          new Date(l.scheduled_date) < today
      ).length || 0;

    const totalCost =
      logs?.reduce((sum: number, l: any) => sum + (l.cost || 0), 0) || 0;

    // Calculate average completion time
    const completedLogs =
      logs?.filter((l: any) => l.status === 'completed' && l.completed_date) ||
      [];
    const avgCompletionTime =
      completedLogs.length > 0
        ? completedLogs.reduce((sum: number, l: any) => {
            const scheduled = new Date(l.scheduled_date);
            const completed = new Date(l.completed_date!);
            const diff = completed.getTime() - scheduled.getTime();
            return sum + diff / (1000 * 60 * 60 * 24); // Convert to days
          }, 0) / completedLogs.length
        : 0;

    // Group by type
    const byType = Object.entries(
      logs?.reduce((acc: any, l: any) => {
        acc[l.maintenance_type] = (acc[l.maintenance_type] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([type, count]) => ({ type: type as any, count: count as number }));

    // Group by status
    const byStatus = Object.entries(
      logs?.reduce((acc: any, l: any) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([status, count]) => ({
      status: status as MaintenanceStatus,
      count: count as number
    }));

    return {
      total_maintenance: total,
      completed,
      pending,
      overdue,
      total_cost: totalCost,
      avg_completion_time: avgCompletionTime,
      by_type: byType,
      by_status: byStatus
    };
  }

  /**
   * Get upcoming maintenance (next 30 days)
   */
  async getUpcomingMaintenance(): Promise<MaintenanceLog[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const { data, error } = await this.supabase
      .from('resource_maintenance_logs')
      .select(
        `
        *,
        resource:resources(id, name, resource_code),
        assigned_to:profiles!assigned_to_user_id(id, full_name, email)
      `
      )
      .gte('scheduled_date', today.toISOString().split('T')[0])
      .lte('scheduled_date', futureDate.toISOString().split('T')[0])
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('[MaintenanceService] Error fetching upcoming maintenance:', error);
      throw error;
    }
    return (data || []) as MaintenanceLog[];
  }

  /**
   * Get overdue maintenance
   */
  async getOverdueMaintenance(): Promise<MaintenanceLog[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase
      .from('resource_maintenance_logs')
      .select(
        `
        *,
        resource:resources(id, name, resource_code),
        assigned_to:profiles!assigned_to_user_id(id, full_name, email)
      `
      )
      .lt('scheduled_date', today)
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('[MaintenanceService] Error fetching overdue maintenance:', error);
      throw error;
    }
    return (data || []) as MaintenanceLog[];
  }
}

export const maintenanceService = new MaintenanceService();
