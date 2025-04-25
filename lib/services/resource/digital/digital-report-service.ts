'use client';

import { getSupabaseClient } from '@/lib/supabase/client';
import {
  DigitalUsageReport,
  DigitalUsageReportFilters,
  DigitalUsageReportListResponse,
  GenerateDigitalUsageReportDto
} from '@/types/digital-resources';
import { toast } from 'react-hot-toast';

export class DigitalReportService {
  /**
   * Get all digital resource usage reports with optional filtering
   */
  static async getReports(
    filters: DigitalUsageReportFilters = {}
  ): Promise<DigitalUsageReportListResponse> {
    try {
      console.log('Fetching digital resource reports with filters:', filters);

      // Set default pagination values
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      // Start building the query
      let query = getSupabaseClient()
        .from('digital_resource_reports')
        .select(
          `
          *,
          digital_resource:digital_resource_id (
            id,
            digital_resource_name,
            type
          )
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.digital_resource_id) {
        query = query.eq('digital_resource_id', filters.digital_resource_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.report_type) {
        query = query.eq('report_type', filters.report_type);
      }

      if (filters.start_date) {
        query = query.gte('generated_at', filters.start_date);
      }

      if (filters.end_date) {
        query = query.lte('generated_at', filters.end_date);
      }

      if (filters.search) {
        query = query.textSearch('search_text', filters.search, {
          config: 'english'
        });
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'generated_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const { data, error, count } = await query.range(
        offset,
        offset + limit - 1
      );

      if (error) {
        // Check for specific error types
        if (
          error.message?.includes(
            'relation "digital_resource_reports" does not exist'
          )
        ) {
          return {
            data: [],
            metadata: {
              total: 0,
              page,
              limit,
              totalPages: 0
            }
          };
        }
        throw error;
      }

      // Transform the data if needed
      const reports = data as unknown as DigitalUsageReport[];

      return {
        data: reports,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching digital resource reports:', error);
      // Return empty results instead of throwing
      return {
        data: [],
        metadata: {
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 10,
          totalPages: 0
        }
      };
    }
  }

  /**
   * Get a single digital resource usage report by ID
   */
  static async getReportById(id: string): Promise<DigitalUsageReport | null> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('digital_resource_reports')
        .select(
          `
          *,
          digital_resource:digital_resource_id (
            id,
            digital_resource_name,
            type
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        // Check for specific error types
        if (
          error.message?.includes(
            'relation "digital_resource_reports" does not exist'
          )
        ) {
          return null;
        }
        throw error;
      }

      return data as unknown as DigitalUsageReport;
    } catch (error) {
      console.error(`Error fetching digital resource report ${id}:`, error);
      return null;
    }
  }

  /**
   * Generate a new digital resource usage report
   */
  static async generateReport(
    reportData: GenerateDigitalUsageReportDto
  ): Promise<{ id: string; status: string }> {
    try {
      // First, insert the report with "processing" status
      const { data: newReport, error: insertError } = await getSupabaseClient()
        .from('digital_resource_reports')
        .insert({
          digital_resource_id: reportData.digitalResourceId,
          start_date:
            typeof reportData.startDate === 'string'
              ? reportData.startDate
              : reportData.startDate.toISOString(),
          end_date:
            typeof reportData.endDate === 'string'
              ? reportData.endDate
              : reportData.endDate.toISOString(),
          generated_at: new Date().toISOString(),
          status: 'processing',
          report_type: reportData.reportType,
          // Include a sample summary for demo purposes
          summary: JSON.stringify({
            total_views: Math.floor(Math.random() * 1000),
            total_downloads: Math.floor(Math.random() * 300),
            unique_users: Math.floor(Math.random() * 200),
            peak_usage_count: Math.floor(Math.random() * 100),
            peak_usage_day: new Date().toISOString()
          })
        })
        .select('id')
        .single();

      if (insertError) {
        // Check for specific error types
        if (
          insertError.message?.includes(
            'relation "digital_resource_reports" does not exist'
          )
        ) {
          throw new Error(
            'Digital reports feature is not ready yet. Please run database migrations first.'
          );
        }
        throw insertError;
      }

      // In a real implementation, you would trigger a background process
      // to generate the actual report data, but for demo purposes,
      // we'll update the status to completed after creation
      await getSupabaseClient()
        .from('digital_resource_reports')
        .update({ status: 'completed' })
        .eq('id', newReport.id);

      // Return the report ID to the client so they can check its status later
      return {
        id: newReport.id,
        status: 'completed'
      };
    } catch (error) {
      console.error('Error generating digital resource report:', error);
      throw error;
    }
  }

  /**
   * Download a report as PDF or CSV - simplified mock implementation
   */
  static async downloadReport(
    id: string,
    format: 'pdf' | 'csv'
  ): Promise<Blob> {
    try {
      // Check if report exists
      const { data, error } = await getSupabaseClient()
        .from('digital_resource_reports')
        .select('id, status')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (data.status !== 'completed') {
        throw new Error('Report is not completed yet');
      }

      // Return a mock blob
      return new Blob(['Report data for ' + id], {
        type: format === 'pdf' ? 'application/pdf' : 'text/csv'
      });
    } catch (error) {
      console.error(`Error downloading digital resource report ${id}:`, error);
      throw error;
    }
  }
}
