import { useMutation, UseMutationResult } from '@tanstack/react-query';
import type { ReportConfig } from '@/types/usage-analytics';
import type { ReportData } from '@/lib/services/analytics/usage-report-service';
import { ExportService } from '@/lib/services/export-service';

/**
 * Hook to generate and download lifecycle analytics reports.
 * Returns a mutation that generates report data server-side,
 * then exports it client-side using ExportService.
 */
export function useGenerateReport(): UseMutationResult<
  ReportData,
  Error,
  ReportConfig
> {
  return useMutation({
    mutationFn: async (config: ReportConfig): Promise<ReportData> => {
      const response = await fetch('/api/analytics/usage/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate report');
      }

      const result = await response.json();
      return result.data;
    },
    onSuccess: (data, config) => {
      // Export client-side using ExportService
      for (const section of data.sections) {
        const filename = `${config.type}-${config.date_from}-to-${config.date_to}`;
        const title = data.title;

        switch (config.format) {
          case 'csv':
            ExportService.exportToCSV(section.rows, section.headers, filename);
            break;
          case 'excel':
            ExportService.exportToExcel(
              section.rows,
              section.headers,
              filename,
              section.title
            );
            break;
          case 'pdf':
            ExportService.exportToPDF(
              section.rows,
              section.headers,
              filename,
              title,
              'landscape'
            );
            break;
        }
      }
    },
  });
}
