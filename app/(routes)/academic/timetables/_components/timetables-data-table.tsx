'use client';

import { useState, useEffect, useRef } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { TimetablesSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { Timetable } from '@/types/academics';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
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

interface TimetablesDataTableProps {
  search: TimetablesSearchParams;
}

export function TimetablesDataTable({ search }: TimetablesDataTableProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [timetablesToDelete, setTimetablesToDelete] = useState<Timetable[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time refresh mechanism
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataTableRefreshRef = useRef<(() => void) | null>(null);

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  // Permission checks
  const canCreateTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'create');
  const canDeleteTimetable =
    isSuperAdmin || canAccess('academic.timetables', 'delete');

  // Auto-refresh mechanism to catch automatic sync updates
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const checkForUpdates = () => {
      // Only refresh if it's been more than 30 seconds since last refresh
      const now = new Date();
      const timeSinceLastRefresh = now.getTime() - lastRefresh.getTime();

      if (timeSinceLastRefresh > 30000) {
        // 30 seconds
        setLastRefresh(now);
        if (dataTableRefreshRef.current) {
          dataTableRefreshRef.current();
          toast.success('🔄 Timetable data refreshed automatically');
        }
      }
    };

    // Check for updates every 2 minutes
    refreshIntervalRef.current = setInterval(checkForUpdates, 120000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefreshEnabled, lastRefresh]);

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
      // Map the DataTable parameters to our TimetableService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id:
          search.institution_id ||
          (!isSuperAdmin && userProfile?.institution_id
            ? userProfile.institution_id
            : undefined),
        academic_year_id: search.academic_year_id || undefined,
        degree_id: search.degree_id || undefined,
        program_id: search.program_id || undefined,
        department_id: search.department_id || undefined,
        semester: search.semester || undefined,
        section: search.section || undefined,
        is_active:
          search.is_active === 'true'
            ? true
            : search.is_active === 'false'
            ? false
            : undefined,
        is_template:
          search.is_template === 'true'
            ? true
            : search.is_template === 'false'
            ? false
            : undefined
      };

      const { data, metadata } = await TimetableService.getTimetables(filters);

      // Debug logging - remove this after fixing
      console.log('🔍 TimetableService.getTimetables returned:', {
        dataCount: data?.length || 0,
        firstItem: data?.[0] || null,
        hasSemstersOnFirst: data?.[0]?.semesters || 'no semesters property',
        hasSectionsOnFirst: data?.[0]?.sections || 'no sections property',
      });

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
      console.error('Error fetching timetables:', error);
      throw error;
    }
  };

  const handleBulkDelete = (
    selectedRows: Timetable[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setTimetablesToDelete(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    try {
      setIsDeleting(true);

      // Use the bulk delete method from TimetableService
      const result = await TimetableService.bulkDeleteTimetables(
        timetablesToDelete.map((timetable) => timetable.id)
      );

      const { success, failed } = result;

      // Reset selection after deletion
      if (resetSelectionFn) {
        resetSelectionFn();
      }

      // Show appropriate toast messages
      if (success.length > 0 && failed.length === 0) {
        toast.success(
          `${success.length} timetable${
            success.length > 1 ? 's' : ''
          } deleted successfully`
        );
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} timetable${
            success.length > 1 ? 's' : ''
          } deleted successfully`
        );
        toast.error(
          `Failed to delete ${failed.length} timetable${
            failed.length > 1 ? 's' : ''
          }`
        );
      } else if (failed.length > 0) {
        toast.error(
          `Failed to delete ${failed.length} timetable${
            failed.length > 1 ? 's' : ''
          }`
        );
      }

      // The DataTable will automatically refetch data after this
    } catch (error) {
      console.error('Error deleting timetables:', error);
      toast.error('Failed to delete timetables');
    } finally {
      setIsDeleting(false);
      setShowBulkDeleteDialog(false);
      setTimetablesToDelete([]);
      setResetSelectionFn(null);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
    refreshData?: () => void;
  }) => {
    // Store the refresh function for auto-refresh
    if (props.refreshData && !dataTableRefreshRef.current) {
      dataTableRefreshRef.current = props.refreshData;
    }

    return (
      <div className='flex items-center gap-2'>
        {canCreateTimetable && (
          <Button
            onClick={() => router.push('/academic/timetables/new')}
            size='sm'
            className='h-8'
          >
            <Plus className='mr-2 h-4 w-4' />
            Add Timetable
          </Button>
        )}

        {/* Manual Refresh Button */}
        <Button
          onClick={() => {
            if (props.refreshData) {
              props.refreshData();
              setLastRefresh(new Date());
              toast.success('🔄 Timetable data refreshed');
            }
          }}
          size='sm'
          variant='outline'
          className='h-8'
        >
          <RefreshCcw className='mr-2 h-4 w-4' />
          Refresh
        </Button>

        {canDeleteTimetable && props.selectedRows.length > 0 && (
          <Button
            onClick={() =>
              handleBulkDelete(
                props.selectedRows as Timetable[],
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

        {/* Auto-refresh indicator */}
        {autoRefreshEnabled && (
          <div className='text-xs text-muted-foreground ml-2'>
            Auto-refresh enabled (2min intervals)
          </div>
        )}
      </div>
    );
  };

  // Show loading state while waiting for permissions and profile
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
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'timetables',
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
          columnResizingTableId: 'timetables-table'
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {timetablesToDelete.length} timetable
              {timetablesToDelete.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              selected timetable{timetablesToDelete.length > 1 ? 's' : ''} and
              all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
