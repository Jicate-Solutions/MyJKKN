'use client';
import { useCallback } from 'react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { SourceTrackingService } from '@/lib/services/admission/source-tracking-service';
import type { SourceSummary } from '@/lib/services/admission/source-tracking-service';

export function SourcesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = useCallback(async (params: DataFetchParams) => {
    const data = await SourceTrackingService.getSourceBreakdown(institutionId);
    const filtered = params.search
      ? data.filter((item) =>
          item.source.toLowerCase().includes(params.search.toLowerCase())
        )
      : data;
    const sorted = [...filtered].sort((a, b) => {
      const key = params.sort_by as keyof SourceSummary;
      if (!key || !(key in a)) return 0;
      const aVal = a[key] as string | number;
      const bVal = b[key] as string | number;
      if (params.sort_order === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
    return {
      success: true,
      data: sorted,
      pagination: {
        page: 1,
        limit: 1000,
        total_pages: 1,
        total_items: sorted.length,
      },
    };
  }, [institutionId]);

  return (
    <DataTable
      fetchDataFn={fetchData as any}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'lead-sources',
        columnMapping: {
          source: 'Source',
          leads: 'Leads',
          conversions: 'Conversions',
          conversionRate: 'Conversion Rate (%)',
        },
        columnWidths: [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 20 }],
        headers: ['Source', 'Leads', 'Conversions', 'Conversion Rate (%)'],
      }}
      idField="source"
      config={{
        enableUrlState: false,
        enableDateFilter: false,
        enableExport: true,
        enableRowSelection: false,
      }}
    />
  );
}
