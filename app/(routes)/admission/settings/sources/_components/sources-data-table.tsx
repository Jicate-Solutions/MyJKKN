'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Plus } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { SourceMasterService } from '@/lib/services/admission/source-master-service';
import type { SourceMaster } from '@/lib/services/admission/source-master-service';
import { columns } from './columns';
import { SourceFormDialog } from './source-form-dialog';

const SourcesRefreshContext = createContext<() => void>(() => {});
export const useSourcesRefresh = () => useContext(SourcesRefreshContext);

export function SourcesDataTable() {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();

  const institutionId = isSuperAdmin
    ? undefined
    : profile?.institution_id || undefined;

  const canManage =
    isSuperAdmin || canAccess('admission.settings.sources', 'manage');

  const [refetchKey, setRefetchKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const bumpRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const data = await SourceMasterService.list({
        search: params.search,
        institution_id: institutionId ?? null, // null fetches global rows when not super_admin scope
        sortBy: (params.sort_by as keyof SourceMaster) || 'display_order',
        sortOrder: (params.sort_order as 'asc' | 'desc') || 'asc',
      });

      // Local search filter for label OR key (covers either pattern)
      const filtered = params.search
        ? data.filter(
            (item) =>
              item.label.toLowerCase().includes(params.search.toLowerCase()) ||
              item.key.toLowerCase().includes(params.search.toLowerCase())
          )
        : data;

      return {
        success: true,
        data: filtered,
        pagination: {
          page: 1,
          limit: 1000,
          total_pages: 1,
          total_items: filtered.length,
        },
      };
    },
    [institutionId]
  );

  const renderToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="flex items-center gap-2">
      {canManage && (
        <Button onClick={() => setCreateOpen(true)} size="sm" className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          New Source
        </Button>
      )}
    </div>
  );

  return (
    <SourcesRefreshContext.Provider value={bumpRefetch}>
      <DataTable
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        refetchKey={refetchKey}
        exportConfig={{
          entityName: 'lead-sources',
          columnMapping: {
            label: 'Label',
            key: 'Key',
            enum_value: 'Routes To',
            counselor_count: 'Counselors',
            lead_count: 'Leads',
            is_active: 'Active',
          },
          columnWidths: [
            { wch: 30 },
            { wch: 20 },
            { wch: 20 },
            { wch: 12 },
            { wch: 12 },
            { wch: 10 },
          ],
          headers: ['Label', 'Key', 'Routes To', 'Counselors', 'Leads', 'Active'],
        }}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: false,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
        }}
        renderToolbarContent={renderToolbar}
      />

      <SourceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        source={null}
        onSaved={bumpRefetch}
      />
    </SourcesRefreshContext.Provider>
  );
}
