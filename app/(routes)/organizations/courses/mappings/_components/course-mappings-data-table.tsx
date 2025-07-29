'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { CourseMappingsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { CourseMapping } from '@/types/organizations';

interface CourseMappingsDataTableProps {
  search: CourseMappingsSearchParams;
}

export function CourseMappingsDataTable({ search }: CourseMappingsDataTableProps) {
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
      // Map the DataTable parameters to our CourseMappingService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: search.institution_id,
        degree_id: search.degree_id,
        department_id: search.department_id,
        program_id: search.program_id,
        semester_id: search.semester_id,
        isActive: search.status === 'active' ? true : search.status === 'inactive' ? false : undefined
      };

      const { data, metadata } = await CourseMappingService.getCourseMappings(filters);

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
      console.error('Error fetching course mappings:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: CourseMapping[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} course mapping${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // Delete all selected course mappings
      await Promise.all(
        selectedRows.map((mapping: CourseMapping) =>
          CourseMappingService.deleteCourseMapping(mapping.id)
        )
      );

      // Reset selection and refresh data
      resetSelection();
      // The DataTable will automatically refetch data after this
    } catch (error) {
      console.error('Error deleting course mappings:', error);
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
        onClick={() => router.push('/organizations/courses/mappings/new')}
        size='sm'
        className='h-8'
      >
        <Plus className='mr-2 h-4 w-4' />
        Map Course
      </Button>

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as CourseMapping[],
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
        entityName: 'course-mappings',
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