'use client';
import { useCallback } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { ScoringRulesService } from '@/lib/services/admission/scoring-rules-service';

export function ScoringRulesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = useCallback(async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    const data = await ScoringRulesService.getScoringRules(institutionId);
    const filtered = params.search
      ? data.filter((item) =>
          JSON.stringify(item).toLowerCase().includes(params.search.toLowerCase())
        )
      : data;
    const start = (params.page - 1) * params.limit;
    const paginated = filtered.slice(start, start + params.limit);
    return {
      success: true,
      data: paginated,
      pagination: {
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil(filtered.length / params.limit) || 1,
        total_items: filtered.length,
      },
    };
  }, [institutionId]);

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns}
      exportConfig={{
        entityName: 'scoring-rules',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
