'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { SemestersSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { Semester } from '@/types/organizations';

interface SemestersDataTableProps {
  search: SemestersSearchParams;
}

export function SemestersDataTable({ search }: SemestersDataTableProps) {
  const router = useRouter();

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
      // Map the DataTable parameters to our SemesterService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        program_id: search.program_id,
        semester_type: search.semester_type,
        status: search.status
      };

      const { data, metadata } = await SemesterService.getSemesters(filters);

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
      console.error('Error fetching semesters:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Semester[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} semester${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // Delete all selected semesters
      await Promise.all(
        selectedRows.map((semester: Semester) =>
          SemesterService.deleteSemester(semester.id)
        )
      );

      // Reset selection and refresh data
      resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      console.error('Error deleting semesters:', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      <Button
        onClick={() => router.push('/organizations/semesters/new')}
        size='sm'
        className='h-8'
      >
        <Plus className='mr-2 h-4 w-4' />
        Add Semester
      </Button>

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Semester[],
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
        entityName: 'semesters',
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