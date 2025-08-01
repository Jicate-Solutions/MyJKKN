'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { InstitutionsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { Institution } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';

interface InstitutionsDataTableProps {
  search: InstitutionsSearchParams;
}

export function InstitutionsDataTable({ search }: InstitutionsDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreate =
    isSuperAdmin || canAccess('organizations.institutions', 'create');

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
        isActive:
          search.status === 'active'
            ? true
            : search.status === 'inactive'
            ? false
            : undefined
      };

      const { data, metadata } = await OrganizationService.getInstitutions(
        filters
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
      console.error('Error fetching institutions:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Institution[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} institution${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await Promise.all(
        selectedRows.map((institution: Institution) =>
          OrganizationService.deleteInstitution(institution.id)
        )
      );
      resetSelection();
    } catch (error) {
      console.error('Error deleting institutions:', error);
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
          onClick={() => router.push('/organizations/institutions/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Institution
        </Button>
      )}

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Institution[],
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

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'institutions',
        columnMapping: {},
        columnWidths: [],
        headers: []
      }}
      idField='id'
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: false,
        enableRowSelection: true
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
