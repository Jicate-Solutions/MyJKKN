'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { AdmissionYearsSearchParams } from './data-table-schema';
import { logger } from '@/lib/utils/enhanced-logger';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import type { AdmissionYear } from '@/types/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { Skeleton } from '@/components/ui/skeleton';

// Context that lets child cells (row-actions) trigger a list refresh
// without prop-drilling through TanStack column definitions.
const AdmissionYearRefreshContext = createContext<() => void>(() => {});

export function useAdmissionYearRefresh() {
  return useContext(AdmissionYearRefreshContext);
}

interface AdmissionYearsDataTableProps {
  search: AdmissionYearsSearchParams;
}

export function AdmissionYearsDataTable({
  search
}: AdmissionYearsDataTableProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();
  // Used only to detect "cross-institution access". RLS still enforces the real scope.
  const { institutions: accessibleInstitutions } = useInstitutionsWithAccess({
    isActive: true
  });
  const hasCrossInstitutionAccess =
    isSuperAdmin || accessibleInstitutions.length > 1;

  const isReady = !permissionsLoading && !!userProfile;

  const canCreate =
    isSuperAdmin || canAccess('admission.settings.years', 'create');
  const canDelete =
    isSuperAdmin || canAccess('admission.settings.years', 'delete');

  // Bump this to force DataTable to re-run fetchDataFn (see DataTable.refetchKey prop)
  const [refetchKey, setRefetchKey] = useState(0);
  const bumpRefetch = useCallback(
    () => setRefetchKey((k) => k + 1),
    []
  );

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id:
          search.institution_id ||
          (!hasCrossInstitutionAccess && userProfile?.institution_id
            ? userProfile.institution_id
            : undefined),
        program_id: search.program_id,
        program_start_year: search.program_start_year,
        isActive:
          search.status === 'active'
            ? true
            : search.status === 'inactive'
              ? false
              : undefined
      };

      const { data, metadata } =
        await AdmissionYearService.getAdmissionYearsWithAccess(
          filters,
          userProfile?.institution_id,
          hasCrossInstitutionAccess
        );

      return {
        success: true,
        data: data || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: metadata?.totalPages ?? 0,
          total_items: metadata?.total ?? 0
        }
      };
    } catch (error) {
      logger.error('admissions', 'Error fetching admission years', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: AdmissionYear[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} admission year${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await Promise.all(
        selectedRows.map((ay) =>
          AdmissionYearService.deleteAdmissionYear(ay.id)
        )
      );
      resetSelection();
      bumpRefetch();       // trigger table re-fetch
      router.refresh();    // also refresh server-rendered breadcrumbs/layout
    } catch (error) {
      logger.error('admissions', 'Error deleting admission years', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreate && (
        <Button
          onClick={() => router.push('/admission/settings/years/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Admission Year
        </Button>
      )}

      {canDelete && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as AdmissionYear[],
              props.resetSelection
            )
          }
          variant='destructive'
          size='sm'
          className='h-8'
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <AdmissionYearRefreshContext.Provider value={bumpRefetch}>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        refetchKey={refetchKey}
        exportConfig={{
          entityName: 'admission-years',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField='id'
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'admission-years-table'
        }}
        renderToolbarContent={renderCustomToolbar}
      />
    </AdmissionYearRefreshContext.Provider>
  );
}
