'use client';
import { useCallback, useState } from 'react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { getColumns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { AssignmentRulesService } from '@/lib/services/admission/assignment-rules-service';

export function AssignmentRulesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  // Bumped by row-action mutations (toggle/delete) so the DataTable re-fetches
  // and reflects the change. Without this, the table used to silently stay stale
  // after edits — the row-actions fire `onRefetch?.()` but no handler was wired.
  const [refetchKey, setRefetchKey] = useState(0);
  const triggerRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

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
      getColumns={(handleRowDeselection) => getColumns(handleRowDeselection, triggerRefetch) as any}
      refetchKey={refetchKey}
      exportConfig={{
        entityName: 'assignment-rules',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{ enableUrlState: false, enableDateFilter: false, enableExport: true }}
    />
  );
}
