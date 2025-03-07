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
      // Check if a report already exists for this time period
      const { data: existingReport, error: existingReportError } =
        await this.supabase
          .from('usage_reports')
          .select('metrics')
          .eq('resource_id', resourceId)
          .eq('start_date', startDate)
          .eq('end_date', endDate)
          .maybeSingle();

      if (existingReportError) throw existingReportError;

      if (existingReport) {
        const metrics = existingReport.metrics;
        return {
          totalHours: metrics.total_hours_used,
          utilizationPercentage: metrics.utilization_percentage,
          reservationCount: metrics.reservation_count,
          uniqueUsers: metrics.unique_users
        };
      }

      // If no existing report, generate a new one
      const { data: reportId, error } = await this.supabase.rpc(
        'generate_usage_report',
        {
          p_resource_id: resourceId,
          p_start_date: startDate,
          p_end_date: endDate
        }
      );

      if (error) throw error;

      // Fetch the generated report
      const { data: report, error: reportError } = await this.supabase
        .from('usage_reports')
        .select('metrics')
        .eq('id', reportId)
        .single();

      if (reportError) throw reportError;

      const metrics = report.metrics;
      return {
        totalHours: metrics.total_hours_used,
        utilizationPercentage: metrics.utilization_percentage,
        reservationCount: metrics.reservation_count,
        uniqueUsers: metrics.unique_users
      };
    } catch (error) {
      console.error('Error fetching resource utilization:', error);
      toast.error('Failed to fetch resource utilization');
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
      // This is a complex query that would ideally be a stored procedure
      // For now, we'll fetch all reports for the institution and sort them in JS
      const { data: resources, error: resourcesError } = await this.supabase
        .from('resources')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('is_active', true);

      if (resourcesError) throw resourcesError;

      if (!resources || resources.length === 0) {
        return [];
      }

      const resourceIds = resources.map((r) => r.id);

      const { data: reports, error: reportsError } = await this.supabase
        .from('usage_reports')
        .select(
          `
          resource_id,
          metrics,
          resource:resources(resource_name)
        `
        )
        .in('resource_id', resourceIds)
        .gte('start_date', startDate)
        .lte('end_date', endDate);

      if (reportsError) throw reportsError;

      if (!reports || reports.length === 0) {
        return [];
      }

      // Sort by utilization percentage and take the top N
      const sortedReports = reports
        .sort(
          (a, b) =>
            b.metrics.utilization_percentage - a.metrics.utilization_percentage
        )
        .slice(0, limit);

      return sortedReports.map((report) => ({
        resourceId: report.resource_id,
        resourceName: report.resource.resource_name,
        utilizationPercentage: report.metrics.utilization_percentage
      }));
    } catch (error) {
      console.error('Error fetching top utilized resources:', error);
      toast.error('Failed to fetch top utilized resources');
      throw error;
    }
  }
}
