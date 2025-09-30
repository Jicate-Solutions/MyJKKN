// lib/services/analytics/analytics-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AnalyticsFilters,
  ResourceAnalytics,
  ReservationAnalytics,
  MaintenanceAnalytics,
  UserAnalytics,
  FinancialAnalytics,
  DashboardSummary
} from '@/types/analytics';
import { AnalyticsPeriod } from '@/types/analytics';

const supabase = createClientSupabaseClient();

class AnalyticsService {
  /**
   * Get date range based on period
   */
  private getDateRange(
    period: AnalyticsPeriod,
    customStart?: string,
    customEnd?: string
  ) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case AnalyticsPeriod.TODAY:
        startDate = today;
        break;
      case AnalyticsPeriod.YESTERDAY:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = today;
        break;
      case AnalyticsPeriod.LAST_7_DAYS:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case AnalyticsPeriod.LAST_30_DAYS:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        break;
      case AnalyticsPeriod.LAST_90_DAYS:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 90);
        break;
      case AnalyticsPeriod.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case AnalyticsPeriod.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case AnalyticsPeriod.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case AnalyticsPeriod.CUSTOM:
        if (customStart && customEnd) {
          startDate = new Date(customStart);
          endDate = new Date(customEnd);
        } else {
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 30);
        }
        break;
      default:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
    }

    return {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString()
    };
  }

  /**
   * Get resource analytics
   */
  async getResourceAnalytics(
    filters: AnalyticsFilters
  ): Promise<ResourceAnalytics> {
    const dateRange = this.getDateRange(
      filters.period || AnalyticsPeriod.LAST_30_DAYS,
      filters.start_date,
      filters.end_date
    );

    // Base query with filters
    let resourceQuery = supabase.from('resources').select(`
        *,
        parent_category:parent_categories(id, name),
        sub_category:sub_categories(id, name),
        institution:institutions(id, name),
        department:departments(id, name)
      `);

    if (filters.institution_id) {
      resourceQuery = resourceQuery.eq(
        'institution_id',
        filters.institution_id
      );
    }
    if (filters.department_id) {
      resourceQuery = resourceQuery.eq('department_id', filters.department_id);
    }
    if (filters.parent_category_id) {
      resourceQuery = resourceQuery.eq(
        'parent_category_id',
        filters.parent_category_id
      );
    }
    if (filters.sub_category_id) {
      resourceQuery = resourceQuery.eq(
        'sub_category_id',
        filters.sub_category_id
      );
    }

    const { data: resources, error } = await resourceQuery;
    if (error) throw error;

    // Calculate analytics
    const total_resources = resources?.length || 0;
    const active_resources =
      resources?.filter((r: any) => r.status === 'available').length || 0;
    const inactive_resources =
      resources?.filter((r: any) => r.status === 'inactive').length || 0;
    const under_maintenance =
      resources?.filter((r: any) => r.status === 'maintenance').length || 0;
    const total_value =
      resources?.reduce(
        (sum: number, r: any) => sum + (r.acquisition_cost || 0),
        0
      ) || 0;

    // Category breakdown
    const categoryMap = new Map<string, any>();
    resources?.forEach((resource: any) => {
      const catId = resource.parent_category?.id;
      const catName = resource.parent_category?.name || 'Uncategorized';
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          category_id: catId,
          category_name: catName,
          resource_count: 0,
          total_reservations: 0,
          utilization_rate: 0,
          total_value: 0
        });
      }
      const cat = categoryMap.get(catId);
      cat.resource_count++;
      cat.total_value += resource.acquisition_cost || 0;
    });

    // Institution breakdown
    const institutionMap = new Map<string, any>();
    resources?.forEach((resource: any) => {
      const instId = resource.institution?.id;
      const instName = resource.institution?.name || 'Unknown';
      if (!institutionMap.has(instId)) {
        institutionMap.set(instId, {
          institution_id: instId,
          institution_name: instName,
          resource_count: 0,
          total_reservations: 0,
          utilization_rate: 0,
          departments: []
        });
      }
      const inst = institutionMap.get(instId);
      inst.resource_count++;
    });

    // Status breakdown
    const statusMap = new Map<string, number>();
    resources?.forEach((resource: any) => {
      const status = resource.status || 'unknown';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });

    const by_status = Array.from(statusMap.entries()).map(
      ([status, count]) => ({
        status,
        count,
        percentage: (count / total_resources) * 100
      })
    );

    return {
      total_resources,
      active_resources,
      inactive_resources,
      under_maintenance,
      total_value,
      avg_utilization_rate: 0, // Will be calculated from reservations
      by_category: Array.from(categoryMap.values()),
      by_institution: Array.from(institutionMap.values()),
      by_status,
      trend_data: []
    };
  }

  /**
   * Get reservation analytics
   */
  async getReservationAnalytics(
    filters: AnalyticsFilters
  ): Promise<ReservationAnalytics> {
    const dateRange = this.getDateRange(
      filters.period || AnalyticsPeriod.LAST_30_DAYS,
      filters.start_date,
      filters.end_date
    );

    let reservationQuery = supabase
      .from('resource_reservations')
      .select(
        `
        *,
        resource:resources(id, name, institution_id, department_id),
        user:profiles!reserved_by_user_id(id, full_name)
      `
      )
      .gte('start_date', dateRange.start_date)
      .lte('end_date', dateRange.end_date);

    if (filters.institution_id) {
      reservationQuery = reservationQuery.eq(
        'resource.institution_id',
        filters.institution_id
      );
    }
    if (filters.department_id) {
      reservationQuery = reservationQuery.eq(
        'resource.department_id',
        filters.department_id
      );
    }
    if (filters.resource_id) {
      reservationQuery = reservationQuery.eq(
        'resource_id',
        filters.resource_id
      );
    }

    const { data: reservations, error } = await reservationQuery;
    if (error) throw error;

    const total_reservations = reservations?.length || 0;
    const completed_reservations =
      reservations?.filter((r: any) => r.status === 'completed').length || 0;
    const cancelled_reservations =
      reservations?.filter((r: any) => r.status === 'cancelled').length || 0;
    const pending_reservations =
      reservations?.filter((r: any) => r.status === 'pending').length || 0;
    const no_show_count =
      reservations?.filter((r: any) => r.status === 'no_show').length || 0;

    // Calculate average duration
    const total_hours =
      reservations?.reduce((sum: number, r: any) => {
        const start = new Date(r.start_date);
        const end = new Date(r.end_date);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0) || 0;
    const avg_duration_hours =
      total_reservations > 0 ? total_hours / total_reservations : 0;

    // Status breakdown
    const statusMap = new Map<string, any>();
    reservations?.forEach((reservation: any) => {
      const status = reservation.status || 'unknown';
      if (!statusMap.has(status)) {
        statusMap.set(status, { status, count: 0, percentage: 0, revenue: 0 });
      }
      const stat = statusMap.get(status);
      stat.count++;
      stat.revenue += reservation.total_amount || 0;
    });

    const by_status = Array.from(statusMap.values()).map((stat) => ({
      ...stat,
      percentage: (stat.count / total_reservations) * 100
    }));

    // Resource breakdown
    const resourceMap = new Map<string, any>();
    reservations?.forEach((reservation: any) => {
      const resId = reservation.resource?.id;
      const resName = reservation.resource?.name || 'Unknown';
      if (!resourceMap.has(resId)) {
        resourceMap.set(resId, {
          resource_id: resId,
          resource_name: resName,
          reservation_count: 0,
          total_hours: 0,
          utilization_rate: 0,
          revenue: 0
        });
      }
      const res = resourceMap.get(resId);
      res.reservation_count++;
      const start = new Date(reservation.start_date);
      const end = new Date(reservation.end_date);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      res.total_hours += hours;
      res.revenue += reservation.total_amount || 0;
    });

    const total_revenue =
      reservations?.reduce(
        (sum: number, r: any) => sum + (r.total_amount || 0),
        0
      ) || 0;

    return {
      total_reservations,
      completed_reservations,
      cancelled_reservations,
      pending_reservations,
      no_show_count,
      avg_duration_hours,
      total_revenue,
      by_status,
      by_resource: Array.from(resourceMap.values()),
      by_time_slot: [],
      trend_data: []
    };
  }

  /**
   * Get maintenance analytics
   */
  async getMaintenanceAnalytics(
    filters: AnalyticsFilters
  ): Promise<MaintenanceAnalytics> {
    const dateRange = this.getDateRange(
      filters.period || AnalyticsPeriod.LAST_30_DAYS,
      filters.start_date,
      filters.end_date
    );

    let maintenanceQuery = supabase
      .from('resource_maintenance_logs')
      .select(
        `
        *,
        resource:resources(id, name, institution_id, department_id)
      `
      )
      .gte('scheduled_date', dateRange.start_date)
      .lte('scheduled_date', dateRange.end_date);

    if (filters.institution_id) {
      maintenanceQuery = maintenanceQuery.eq(
        'resource.institution_id',
        filters.institution_id
      );
    }
    if (filters.resource_id) {
      maintenanceQuery = maintenanceQuery.eq(
        'resource_id',
        filters.resource_id
      );
    }

    const { data: maintenanceLogs, error } = await maintenanceQuery;
    if (error) throw error;

    const total_maintenance = maintenanceLogs?.length || 0;
    const scheduled_maintenance =
      maintenanceLogs?.filter((m: any) => m.status === 'scheduled').length || 0;
    const completed_maintenance =
      maintenanceLogs?.filter((m: any) => m.status === 'completed').length || 0;
    const overdue_maintenance =
      maintenanceLogs?.filter((m: any) => {
        const scheduledDate = new Date(m.scheduled_date);
        return scheduledDate < new Date() && m.status === 'scheduled';
      }).length || 0;

    const total_cost =
      maintenanceLogs?.reduce(
        (sum: number, m: any) => sum + (m.cost || 0),
        0
      ) || 0;
    const avg_cost_per_maintenance =
      total_maintenance > 0 ? total_cost / total_maintenance : 0;

    // Type breakdown
    const typeMap = new Map<string, any>();
    maintenanceLogs?.forEach((log: any) => {
      const type = log.maintenance_type || 'unknown';
      if (!typeMap.has(type)) {
        typeMap.set(type, {
          maintenance_type: type,
          count: 0,
          total_cost: 0,
          avg_cost: 0
        });
      }
      const t = typeMap.get(type);
      t.count++;
      t.total_cost += log.cost || 0;
    });

    const by_type = Array.from(typeMap.values()).map((t) => ({
      ...t,
      avg_cost: t.count > 0 ? t.total_cost / t.count : 0
    }));

    // Priority breakdown
    const priorityMap = new Map<number, any>();
    maintenanceLogs?.forEach((log: any) => {
      const priority = log.priority || 0;
      if (!priorityMap.has(priority)) {
        priorityMap.set(priority, {
          priority,
          count: 0,
          avg_resolution_days: 0
        });
      }
      priorityMap.get(priority).count++;
    });

    return {
      total_maintenance,
      scheduled_maintenance,
      completed_maintenance,
      overdue_maintenance,
      total_cost,
      avg_cost_per_maintenance,
      by_type,
      by_priority: Array.from(priorityMap.values()),
      cost_trend: []
    };
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(filters: AnalyticsFilters): Promise<UserAnalytics> {
    const dateRange = this.getDateRange(
      filters.period || AnalyticsPeriod.LAST_30_DAYS,
      filters.start_date,
      filters.end_date
    );

    const { data: reservations, error } = await supabase
      .from('resource_reservations')
      .select(
        `
        *,
        user:profiles!reserved_by_user_id(id, full_name, email)
      `
      )
      .gte('start_date', dateRange.start_date)
      .lte('end_date', dateRange.end_date);
    if (error) throw error;

    const userMap = new Map<string, any>();
    reservations?.forEach((reservation: any) => {
      const userId = reservation.user?.id;
      const userName = reservation.user?.full_name || 'Unknown';
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          user_name: userName,
          reservation_count: 0,
          total_hours: 0,
          total_spent: 0
        });
      }
      const user = userMap.get(userId);
      user.reservation_count++;
      const start = new Date(reservation.start_date);
      const end = new Date(reservation.end_date);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      user.total_hours += hours;
      user.total_spent += reservation.total_amount || 0;
    });

    const topUsers = Array.from(userMap.values())
      .sort((a, b) => b.reservation_count - a.reservation_count)
      .slice(0, 10);

    return {
      total_users: userMap.size,
      active_users: userMap.size,
      top_users: topUsers,
      reservation_by_user: Array.from(userMap.values())
    };
  }

  /**
   * Get financial analytics
   */
  async getFinancialAnalytics(
    filters: AnalyticsFilters
  ): Promise<FinancialAnalytics> {
    const reservationAnalytics = await this.getReservationAnalytics(filters);
    const maintenanceAnalytics = await this.getMaintenanceAnalytics(filters);

    const total_revenue = reservationAnalytics.total_revenue;
    const total_expenses = maintenanceAnalytics.total_cost;
    const net_profit = total_revenue - total_expenses;
    const projected_revenue = total_revenue * 1.1; // 10% growth projection

    return {
      total_revenue,
      projected_revenue,
      total_expenses,
      net_profit,
      revenue_by_category: [],
      expense_by_type: maintenanceAnalytics.by_type.map((t) => ({
        expense_type: t.maintenance_type,
        amount: t.total_cost,
        percentage: (t.total_cost / total_expenses) * 100
      })),
      financial_trend: []
    };
  }

  /**
   * Get complete dashboard summary
   */
  async getDashboardSummary(
    filters: AnalyticsFilters
  ): Promise<DashboardSummary> {
    const [resources, reservations, maintenance, users, financial] =
      await Promise.all([
        this.getResourceAnalytics(filters),
        this.getReservationAnalytics(filters),
        this.getMaintenanceAnalytics(filters),
        this.getUserAnalytics(filters),
        this.getFinancialAnalytics(filters)
      ]);

    return {
      resources,
      reservations,
      maintenance,
      users,
      financial
    };
  }
}

export const analyticsService = new AnalyticsService();
