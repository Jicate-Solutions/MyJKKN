'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { StudentsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StudentService } from '@/lib/services/student/student-service';
import { Student } from '@/types/student';
import toast from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface StudentsDataTableProps {
  search: StudentsSearchParams;
}

export function StudentsDataTable({ search }: StudentsDataTableProps) {
  const router = useRouter();
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [studentsToDelete, setStudentsToDelete] = useState<Student[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
        section: search.section_id,
        academic_year: search.academic_year_id
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

  const handleBulkDelete = (
    selectedRows: Student[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    // Store the selected rows and reset function for the confirmation dialog
    setStudentsToDelete(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    if (studentsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      // Use the bulk delete method from StudentService
      const result = await StudentService.bulkDeleteStudents(
        studentsToDelete.map((student) => student.id)
      );

      const { success, failed } = result;

      // Reset selection after deletion
      if (resetSelectionFn) {
        resetSelectionFn();
      }

      // Close dialog
      setShowBulkDeleteDialog(false);
      setStudentsToDelete([]);
      setResetSelectionFn(null);

      // Show appropriate toast messages
      if (success.length > 0 && failed.length === 0) {
        toast.success(
          `${success.length} student${
            success.length > 1 ? 's' : ''
          } deleted successfully`
        );
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} student${
            success.length > 1 ? 's' : ''
          } deleted successfully`
        );
        toast.error(
          `Failed to delete ${failed.length} student${
            failed.length > 1 ? 's' : ''
          }`
        );
      } else if (failed.length > 0) {
        toast.error(
          `Failed to delete ${failed.length} student${
            failed.length > 1 ? 's' : ''
          }`
        );
      }

      // Refresh the table data
      // The DataTable component should handle this automatically
    } catch (error) {
      console.error('Error deleting students:', error);
      toast.error('Failed to delete students. Please try again.');
    } finally {
      setIsDeleting(false);
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
    <>
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {studentsToDelete.length} student
              {studentsToDelete.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              selected students and remove any associated data including photos
              and user accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
