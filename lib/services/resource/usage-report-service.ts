// lib/services/resource/usage-report-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  UsageReport,
  GenerateUsageReportDto,
  UsageReportFilters,
  UsageReportListResponse
} from '@/types/resources';

export class UsageReportService {
  private static supabase = createClientComponentClient();
  private static useMockData = false; // Set to false to use the actual database

  static async generateUsageReport(
    data: GenerateUsageReportDto
  ): Promise<UsageReport> {
    try {
      const { data: reportId, error } = await this.supabase.rpc(
        'generate_usage_report',
        {
          p_resource_id: data.resource_id,
          p_start_date: data.start_date,
          p_end_date: data.end_date
        }
      );

      if (error) throw error;

      // Fetch the generated report
      const { data: report, error: reportError } = await this.supabase
        .from('usage_reports')
        .select(
          `
          *,
          resource:resources(id, resource_name)
        `
        )
        .eq('id', reportId)
        .single();

      if (reportError) throw reportError;
      return report as UsageReport;
    } catch (error) {
      console.error('Error generating usage report:', error);
      toast.error('Failed to generate usage report');
      throw error;
    }
  }

  static async getUsageReports(
    filters: UsageReportFilters = {}
  ): Promise<UsageReportListResponse> {
    try {
      const {
        resource_id,
        start_date,
        end_date,
        page = 1,
        limit = 10
      } = filters;

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Start building the query
      let query = this.supabase.from('usage_reports').select(
        `
          *,
          resource:resources(id, resource_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (resource_id) {
        query = query.eq('resource_id', resource_id);
      }

      if (start_date) {
        query = query.gte('start_date', start_date);
      }

      if (end_date) {
        query = query.lte('end_date', end_date);
      }

      // Apply pagination
      query = query.range(from, to);

      // Execute the query
      const { data, error, count } = await query;

      if (error) throw error;

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as UsageReport[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching usage reports:', error);
      toast.error('Failed to fetch usage reports');
      throw error;
    }
  }

  static async getUsageReport(id: string): Promise<UsageReport> {
    try {
      const { data, error } = await this.supabase
        .from('usage_reports')
        .select(
          `
          *,
          resource:resources(id, resource_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as UsageReport;
    } catch (error) {
      console.error('Error fetching usage report:', error);
      toast.error('Failed to fetch usage report details');
      throw error;
    }
  }

  static async getResourceUtilization(
    resourceId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    totalHours: number;
    utilizationPercentage: number;
    reservationCount: number;
    uniqueUsers: number;
  }> {
    try {
      // Get all approved and completed reservations for the resource in the date range
      const { data: reservations, error } = await this.supabase
        .from('reservations')
        .select('*')
        .eq('resource_id', resourceId)
        .in('status', ['approved', 'completed'])
        .gte('start_datetime', `${startDate}T00:00:00`)
        .lte('end_datetime', `${endDate}T23:59:59`);

      if (error) throw error;

      if (!reservations || reservations.length === 0) {
        return {
          totalHours: 0,
          utilizationPercentage: 0,
          reservationCount: 0,
          uniqueUsers: 0
        };
      }

      // Calculate total hours used
      let totalHours = 0;
      const uniqueUserIds = new Set<string>();

      reservations.forEach((reservation) => {
        const start = new Date(reservation.start_datetime);
        const end = new Date(reservation.end_datetime);
        const durationHours =
          (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        totalHours += durationHours;
        uniqueUserIds.add(reservation.user_id);
      });

      // Calculate total available hours in the date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDifference =
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
        1;

      // Assuming 8 hours of availability per day (can be adjusted based on resource availability)
      const totalAvailableHours = daysDifference * 8;

      // Calculate utilization percentage
      const utilizationPercentage = (totalHours / totalAvailableHours) * 100;

      return {
        totalHours,
        utilizationPercentage,
        reservationCount: reservations.length,
        uniqueUsers: uniqueUserIds.size
      };
    } catch (error) {
      console.error('Error calculating resource utilization:', error);
      toast.error('Failed to calculate resource utilization');
      throw error;
    }
  }

  static async getTopUtilizedResources(
    institutionId: string,
    startDate: string,
    endDate: string,
    limit: number = 5
  ): Promise<
    {
      resourceId: string;
      resourceName: string;
      utilizationPercentage: number;
    }[]
  > {
    try {
      // Get all resources for the institution
      const { data: resources, error: resourcesError } = await this.supabase
        .from('resources')
        .select('id, resource_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true);

      if (resourcesError) throw resourcesError;

      if (!resources || resources.length === 0) {
        return [];
      }

      // Calculate utilization for each resource
      const utilizationPromises = resources.map(async (resource) => {
        const utilization = await this.getResourceUtilization(
          resource.id,
          startDate,
          endDate
        );

        return {
          resourceId: resource.id,
          resourceName: resource.resource_name,
          utilizationPercentage: utilization.utilizationPercentage
        };
      });

      const utilizations = await Promise.all(utilizationPromises);

      // Sort by utilization percentage (descending) and take the top N
      return utilizations
        .sort((a, b) => b.utilizationPercentage - a.utilizationPercentage)
        .slice(0, limit);
    } catch (error) {
      console.error('Error fetching top utilized resources:', error);
      toast.error('Failed to fetch top utilized resources');
      throw error;
    }
  }
}
