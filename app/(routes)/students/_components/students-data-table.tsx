'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { StudentsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StudentService } from '@/lib/services/student/student-service';
import { Student } from '@/types/student';

interface StudentsDataTableProps {
  search: StudentsSearchParams;
}

export function StudentsDataTable({ search }: StudentsDataTableProps) {
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
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        status: search.status,
        is_profile_complete: search.is_profile_complete,
        // Map the filter parameters to match StudentService expectations
        institution: search.institution_id,
        degree: search.degree_id,
        department: search.department_id,
        program: search.program_id,
        semester: search.semester_id,
        section: search.section_id
      };

      const { data, metadata } = await StudentService.getStudents(filters);

      return {
        success: true,
        data: data || [],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total
        }
      };
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Student[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.length} student${
        selectedRows.length > 1 ? 's' : ''
      }? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await Promise.all(
        selectedRows.map((student: Student) =>
          StudentService.deleteStudent(student.id)
        )
      );
      resetSelection();
    } catch (error) {
      console.error('Error deleting students:', error);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Student[],
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
        entityName: 'students',
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
