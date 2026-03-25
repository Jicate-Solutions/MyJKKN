'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { CourseMappingsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import {
  Plus,
  TrashIcon,
  Loader2,
  Upload,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FileJson
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { CourseMapping } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ImportDialog } from './import-dialog';
import toast from 'react-hot-toast';

interface CourseMappingsDataTableProps {
  search: CourseMappingsSearchParams;
}

export function CourseMappingsDataTable({
  search
}: CourseMappingsDataTableProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<CourseMapping[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const canCreate =
    isSuperAdmin || canAccess('organizations.course.mappings', 'create');
  const canDelete =
    isSuperAdmin || canAccess('organizations.course.mappings', 'delete');

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
        isActive:
          search.status === 'active'
            ? true
            : search.status === 'inactive'
            ? false
            : undefined,
        userId: profile?.id // Add userId for institution and department filtering
      };

      const { data, metadata } = await CourseMappingService.getCourseMappings(
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
      console.error('Error fetching course mappings:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: CourseMapping[],
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
        selectedForDelete.map((mapping: CourseMapping) =>
          CourseMappingService.deleteCourseMapping(mapping.id)
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(`Successfully deleted ${successful} course mapping${successful > 1 ? 's' : ''}`);
      }
      
      if (failed > 0) {
        toast.error(`Failed to delete ${failed} course mapping${failed > 1 ? 's' : ''}`);
      }

      if (deleteResetFn) {
        deleteResetFn();
      }
      
      // Refresh the table
      router.refresh();
      
      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting course mappings:', error);
      toast.error('An error occurred while deleting course mappings');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export handlers
  const handleExport = async (format: 'xlsx' | 'csv' | 'json') => {
    try {
      const response = await fetch(
        `/api/organizations/course-mappings/export?format=${format}&includeAll=true`
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `course-mappings-export-${new Date().toISOString().split('T')[0]}.${
        format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : 'json'
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Export completed successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export course mappings');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/organizations/course-mappings/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `course-mappings-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Template download error:', error);
      toast.error('Failed to download template');
    }
  };

  const handleImportComplete = () => {
    setRefreshTrigger((prev) => prev + 1);
    router.refresh();
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
          onClick={() => router.push('/organizations/courses/mappings/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Map Course
        </Button>
      )}

      {canCreate && (
        <Button
          onClick={() => setImportOpen(true)}
          variant='outline'
          size='sm'
          className='h-8'
        >
          <Upload className='mr-2 h-4 w-4' />
          Import
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm' className='h-8'>
            <Download className='mr-2 h-4 w-4' />
            Export
            <ChevronDown className='ml-2 h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className='mr-2 h-4 w-4' />
            Export as Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('csv')}>
            <FileText className='mr-2 h-4 w-4' />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('json')}>
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

      {/* Fixed: 2025-12-27 - Only show bulk delete if user has delete permission */}
      {props.selectedRows.length > 0 && canDelete && (
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
    <>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedForDelete.length > 1
                ? `Delete ${selectedForDelete.length} Course Mappings`
                : `Delete Course Mapping`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the course mapping{selectedForDelete.length > 1 ? 's' : ''} and all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* List course mappings to be deleted */}
          {selectedForDelete.length > 0 && (
            <div className="my-4 p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">
                Course Mapping{selectedForDelete.length > 1 ? 's' : ''} to be deleted:
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedForDelete.map((mapping) => (
                  <div key={mapping.id} className="text-sm">
                    • {mapping.course?.course_name} - {mapping.semester?.semester_name}
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedForDelete.length > 1 ? `${selectedForDelete.length} Course Mappings` : 'Course Mapping'}`
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
