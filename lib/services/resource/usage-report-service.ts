// lib/services/resource/usage-report-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  UsageReport,
  GenerateUsageReportDto,
  UsageReportFilters,
  UsageReportListResponse
} from '@/types/resources';

// Mock data for development
const MOCK_REPORTS: UsageReport[] = [
  {
    id: '1',
    resource_id: 'res-1',
    start_date: '2023-01-01',
    end_date: '2023-01-31',
    metrics: {
      total_hours_used: 120,
      utilization_percentage: 75.5,
      reservation_count: 45,
      unique_users: 12,
      cross_institution_usage: 3
    },
    usage_by_institution: { 'inst-1': 80, 'inst-2': 40 },
    usage_by_department: { 'dept-1': 50, 'dept-2': 70 },
    peak_usage_times: { '9-10': 15, '10-11': 20, '14-15': 18 },
    created_at: '2023-02-01',
    resource: {
      id: 'res-1',
      resource_name: 'Microscope Lab'
    }
  },
  {
    id: '2',
    resource_id: 'res-2',
    start_date: '2023-02-01',
    end_date: '2023-02-28',
    metrics: {
      total_hours_used: 85,
      utilization_percentage: 62.3,
      reservation_count: 32,
      unique_users: 8,
      cross_institution_usage: 2
    },
    usage_by_institution: { 'inst-1': 65, 'inst-3': 20 },
    usage_by_department: { 'dept-1': 40, 'dept-3': 45 },
    peak_usage_times: { '11-12': 12, '13-14': 14, '15-16': 10 },
    created_at: '2023-03-01',
    resource: {
      id: 'res-2',
      resource_name: 'Chemistry Lab'
    }
  }
];

export class UsageReportService {
  private static supabase = createClientComponentClient();
  private static useMockData = false; // Set to false to use the actual database

  static async generateUsageReport(
    data: GenerateUsageReportDto
  ): Promise<UsageReport> {
    try {
      if (this.useMockData) {
        // Return a mock report
        return {
          id: Math.random().toString(36).substring(2, 9),
          resource_id: data.resource_id,
          start_date: data.start_date,
          end_date: data.end_date,
          metrics: {
            total_hours_used: Math.floor(Math.random() * 100) + 50,
            utilization_percentage: Math.floor(Math.random() * 80) + 20,
            reservation_count: Math.floor(Math.random() * 40) + 10,
            unique_users: Math.floor(Math.random() * 15) + 5,
            cross_institution_usage: Math.floor(Math.random() * 5)
          },
          usage_by_institution: { 'inst-1': 70, 'inst-2': 30 },
          usage_by_department: { 'dept-1': 40, 'dept-2': 60 },
          peak_usage_times: { '9-10': 12, '13-14': 15, '16-17': 10 },
          created_at: new Date().toISOString(),
          resource: {
            id: data.resource_id,
            resource_name: 'Resource ' + data.resource_id.substring(0, 5)
          }
        };
      }

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
      if (this.useMockData) {
        // Return mock data
        const { resource_id, page = 1, limit = 10 } = filters;

        let filteredReports = [...MOCK_REPORTS];

        // Apply filters
        if (resource_id) {
          filteredReports = filteredReports.filter(
            (r) => r.resource_id === resource_id
          );
        }

        if (filters.start_date) {
          filteredReports = filteredReports.filter(
            (r) => r.start_date >= filters.start_date
          );
        }

        if (filters.end_date) {
          filteredReports = filteredReports.filter(
            (r) => r.end_date <= filters.end_date
          );
        }

        // Calculate pagination
        const total = filteredReports.length;
        const totalPages = Math.ceil(total / limit);
        const from = (page - 1) * limit;
        const to = Math.min(from + limit, total);

        return {
          data: filteredReports.slice(from, to),
          metadata: {
            total,
            page,
            limit,
            totalPages
          }
        };
      }

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
      if (this.useMockData) {
        // Find the report in mock data or return the first one
        const report = MOCK_REPORTS.find((r) => r.id === id) || MOCK_REPORTS[0];
        return { ...report, id };
      }

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
      if (this.useMockData) {
        // Return mock utilization data
        return {
          totalHours: Math.floor(Math.random() * 100) + 50,
          utilizationPercentage: Math.floor(Math.random() * 80) + 20,
          reservationCount: Math.floor(Math.random() * 40) + 10,
          uniqueUsers: Math.floor(Math.random() * 15) + 5
        };
      }

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
      if (this.useMockData) {
        // Return mock top resources
        return Array.from({ length: limit }, (_, i) => ({
          resourceId: `res-${i + 1}`,
          resourceName: `Resource ${i + 1}`,
          utilizationPercentage: 90 - i * 10
        }));
      }

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
