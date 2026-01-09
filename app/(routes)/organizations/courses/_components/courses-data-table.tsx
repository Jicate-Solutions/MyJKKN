'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { CoursesSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2, Upload, Download, ChevronDown, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CourseService } from '@/lib/services/organization/course-service';
import { Course } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ImportDialog } from './import-dialog';
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
import toast from 'react-hot-toast';

interface CoursesDataTableProps {
  search: CoursesSearchParams;
}

export function CoursesDataTable({ search }: CoursesDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Course[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fixed: 2025-12-27 - Use correct permission for courses
  const canCreate =
    isSuperAdmin || canAccess('organizations.courses', 'create');
  const canDelete =
    isSuperAdmin || canAccess('organizations.courses', 'delete');

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
      // Map the DataTable parameters to our CourseService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: search.institution_id,
        isActive:
          search.status === 'active'
            ? true
            : search.status === 'inactive'
            ? false
            : undefined
      };

      const { data, metadata } = await CourseService.getCourses(filters);

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
      console.error('Error fetching courses:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Course[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setSelectedForDelete(selectedRows);
    setDeleteResetFn(() => resetSelection);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (selectedForDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedForDelete.map((course: Course) =>
          CourseService.deleteCourse(course.id)
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Successfully deleted ${successful} course${
            successful > 1 ? 's' : ''
          }`
        );
      }

      if (failed > 0) {
        toast.error(
          `Failed to delete ${failed} course${failed > 1 ? 's' : ''}`
        );
      }

      if (deleteResetFn) {
        deleteResetFn();
      }

      // Refresh the table - trigger re-fetch
      setRefreshTrigger(prev => prev + 1);
      router.refresh();

      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting courses:', error);
      toast.error('An error occurred while deleting courses');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportComplete = () => {
    setRefreshTrigger(prev => prev + 1);
    router.refresh();
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/organizations/courses/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `courses-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Template download error:', error);
      toast.error('Failed to download template');
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await fetch('/api/organizations/courses/export?format=xlsx');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `courses-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Courses exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export courses');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/organizations/courses/export?format=csv');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `courses-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Courses exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export courses');
    }
  };

  const handleExportJSON = async () => {
    try {
      const response = await fetch('/api/organizations/courses/export?format=json');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `courses-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Courses exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export courses');
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
        <>
          <Button
            onClick={() => router.push('/organizations/courses/new')}
            size='sm'
            className='h-8'
          >
            <Plus className='mr-2 h-4 w-4' />
            Add Course
          </Button>

          <Button
            variant='outline'
            size='sm'
            className='h-8'
            onClick={() => setImportOpen(true)}
          >
            <Upload className='mr-2 h-4 w-4' />
            Import
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm' className='h-8'>
                <Download className='mr-2 h-4 w-4' />
                Export
                <ChevronDown className='ml-2 h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className='mr-2 h-4 w-4' />
                Export as Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className='mr-2 h-4 w-4' />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className='mr-2 h-4 w-4' />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadTemplate}>
                <Download className='mr-2 h-4 w-4' />
                Download Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Fixed: 2025-12-27 - Only show bulk delete if user has delete permission */}
      {props.selectedRows.length > 0 && canDelete && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Course[],
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
        key={refreshTrigger}
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'courses',
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedForDelete.length > 1
                ? `Delete ${selectedForDelete.length} Courses`
                : `Delete Course: ${selectedForDelete[0]?.course_name}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              course{selectedForDelete.length > 1 ? 's' : ''} and all related
              data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* List courses to be deleted */}
          {selectedForDelete.length > 0 && (
            <div className='my-4 p-3 bg-muted rounded-lg'>
              <div className='text-sm font-medium mb-2'>
                Course{selectedForDelete.length > 1 ? 's' : ''} to be deleted:
              </div>
              <div className='space-y-1 max-h-32 overflow-y-auto'>
                {selectedForDelete.map((course) => (
                  <div key={course.id} className='text-sm'>
                    • {course.course_name} ({course.course_code})
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                `Delete ${
                  selectedForDelete.length > 1
                    ? `${selectedForDelete.length} Courses`
                    : 'Course'
                }`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
    </>
  );
}
