'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DigitalReportService } from '@/lib/services/resource/digital/digital-report-service';
import { toast } from 'react-hot-toast';
import {
  DigitalUsageReportFilters,
  GenerateDigitalUsageReportDto
} from '@/types/digital-resources';

export function useDigitalReports() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DigitalUsageReportFilters>({
    page: 1,
    limit: 10,
    sortBy: 'generated_at',
    sortDirection: 'desc'
  });

  // Get a list of reports
  const {
    data: reportsData,
    isLoading: isLoadingReports,
    error: reportsError,
    refetch: refetchReports
  } = useQuery({
    queryKey: ['digitalReports', filters],
    queryFn: () => DigitalReportService.getReports(filters),
    placeholderData: (previousData) => previousData
  });

  // Get a single report by ID
  const useGetReportById = (id: string) => {
    return useQuery({
      queryKey: ['digitalReport', id],
      queryFn: () => DigitalReportService.getReportById(id),
      enabled: !!id
    });
  };

  // Generate a new report
  const { mutate: generateReport, isPending: isGeneratingReport } = useMutation(
    {
      mutationFn: (data: GenerateDigitalUsageReportDto) =>
        DigitalReportService.generateReport(data),
      onSuccess: () => {
        toast.success('Report generation started successfully');
        queryClient.invalidateQueries({ queryKey: ['digitalReports'] });
      },
      onError: (error: any) => {
        console.error('Error generating report:', error);
        toast.error(
          `Failed to generate report: ${error?.message || 'Unknown error'}`
        );
      }
    }
  );

  // Download report
  const downloadReport = async (id: string, format: 'pdf' | 'csv') => {
    try {
      const blob = await DigitalReportService.downloadReport(id, format);

      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link element
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${id}.${format}`;

      // Append to the document, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Release the URL object
      window.URL.revokeObjectURL(url);

      toast.success(`Report downloaded as ${format.toUpperCase()}`);
      return true;
    } catch (error: any) {
      console.error(`Error downloading report as ${format}:`, error);
      toast.error(
        `Failed to download report: ${error?.message || 'Unknown error'}`
      );
      return false;
    }
  };

  // Update filters
  const updateFilters = (newFilters: Partial<DigitalUsageReportFilters>) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      ...newFilters,
      // If filters change (not pagination), reset to page 1
      page: 'page' in newFilters ? newFilters.page || 1 : 1
    }));
  };

  return {
    reports: reportsData?.data || [],
    metadata: reportsData?.metadata,
    isLoadingReports,
    reportsError,
    filters,
    updateFilters,
    useGetReportById,
    generateReport,
    isGeneratingReport,
    downloadReport,
    refetchReports
  };
}
