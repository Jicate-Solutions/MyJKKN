'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { CourseMappingsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2 } from 'lucide-react';
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
import { toast } from 'sonner';

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
    </>
  );
}
