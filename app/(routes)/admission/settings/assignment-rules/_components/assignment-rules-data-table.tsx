'use client';
import { useCallback } from 'react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { getColumns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { AssignmentRulesService } from '@/lib/services/admission/assignment-rules-service';

export function AssignmentRulesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = useCallback(async (params: DataFetchParams) => {
    const data = await AssignmentRulesService.getAssignmentRules(institutionId);
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
      fetchDataFn={fetchData as any}
      getColumns={(handleRowDeselection) => getColumns(handleRowDeselection) as any}
      exportConfig={{
        entityName: 'assignment-rules',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
    />
  );
}
