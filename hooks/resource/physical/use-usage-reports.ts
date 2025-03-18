// hooks/resource/use-usage-reports.ts

import { useState, useCallback } from 'react';
import type { UsageReport, UsageReportFilters } from '@/types/resources';
import { UsageReportService } from '@/lib/services/resource/physical/usage-report-service';

export function useUsageReports(initialFilters: UsageReportFilters = {}) {
  const [reports, setReports] = useState<UsageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<UsageReportFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchReports = useCallback(
    async (newFilters?: UsageReportFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await UsageReportService.getUsageReports(currentFilters);
        setReports(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching usage reports:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<UsageReportFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchReports(updatedFilters);
    },
    [filters, fetchReports]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchReports(updatedFilters);
    },
    [filters, fetchReports]
  );

  const generateReport = useCallback(
    async (resourceId: string, startDate: string, endDate: string) => {
      try {
        setLoading(true);
        setError(null);
        const report = await UsageReportService.generateUsageReport({
          resource_id: resourceId,
          start_date: startDate,
          end_date: endDate
        });
        // Refresh the list
        fetchReports();
        return report.id;
      } catch (err) {
        console.error('Error generating usage report:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        throw err; // Re-throw the error to be caught by the caller
      } finally {
        setLoading(false);
      }
    },
    [fetchReports]
  );

  const getResourceUtilization = useCallback(
    async (resourceId: string, startDate: string, endDate: string) => {
      try {
        setLoading(true);
        setError(null);
        const utilization = await UsageReportService.getResourceUtilization(
          resourceId,
          startDate,
          endDate
        );
        return utilization;
      } catch (err) {
        console.error('Error fetching resource utilization:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getTopUtilizedResources = useCallback(
    async (
      institutionId: string,
      startDate: string,
      endDate: string,
      limit: number = 5
    ) => {
      try {
        setLoading(true);
        setError(null);
        const topResources = await UsageReportService.getTopUtilizedResources(
          institutionId,
          startDate,
          endDate,
          limit
        );
        return topResources;
      } catch (err) {
        console.error('Error fetching top utilized resources:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteReport = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await UsageReportService.deleteUsageReport(id);
        // Refresh the list after deletion
        fetchReports();
        return true;
      } catch (err) {
        console.error('Error deleting usage report:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReports]
  );

  return {
    reports,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchReports,
    generateReport,
    getResourceUtilization,
    getTopUtilizedResources,
    deleteReport
  };
}
