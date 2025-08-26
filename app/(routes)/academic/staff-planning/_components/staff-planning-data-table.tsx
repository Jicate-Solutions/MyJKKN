'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { StaffPlanningSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { StaffPlan } from '@/types/staff-planning';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { useState } from 'react';

interface StaffPlanningDataTableProps {
  search: StaffPlanningSearchParams;
}

export function StaffPlanningDataTable({
  search
}: StaffPlanningDataTableProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedRowsForDelete, setSelectedRowsForDelete] = useState<
    StaffPlan[]
  >([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();
  const isReady = !permissionsLoading && !!userProfile;

  const canCreateStaffPlan =
    isSuperAdmin || canAccess('academic.staff.planning', 'create');
  const canDeleteStaffPlan =
    isSuperAdmin || canAccess('academic.staff.planning', 'delete');

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const result = await StaffPlanService.bulkDeleteStaffPlans(ids);
      if (result.failed.length > 0) {
        throw new Error(`Failed to delete ${result.failed.length} staff plans`);
      }
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        `Successfully deleted ${result.success.length} staff plans`
      );
      queryClient.invalidateQueries({ queryKey: ['staff-plans'] });
      // Reset dialog state
      setShowDeleteDialog(false);
      setSelectedRowsForDelete([]);
      if (resetSelectionFn) {
        resetSelectionFn();
      }
      setResetSelectionFn(null);
    },
    onError: (error: any) => {
      console.error('Error bulk deleting staff plans:', error);
      toast.error(error?.message || 'Failed to delete staff plans');
      // Close dialog even on error
      setShowDeleteDialog(false);
    }
  });

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
          (!isSuperAdmin && userProfile?.institution_id
            ? userProfile.institution_id
            : undefined),
        degree_id: search.degree_id || undefined,
        department_id: search.department_id || undefined,
        program_id: search.program_id || undefined,
        semester_id: search.semester_id || undefined,
        academic_year_id: search.academic_year_id || undefined,
        course_id: search.course_id || undefined,
        isActive:
          search.isActive === 'true'
            ? true
            : search.isActive === 'false'
            ? false
            : undefined,
        disableConsolidation: true // Show individual staff plans by default
      };

      const response = await StaffPlanService.getStaffPlans(filters);

      return {
        success: true,
        data: response.data || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: response.metadata?.totalPages ?? 0,
          total_items: response.metadata?.total ?? 0
        }
      };
    } catch (error) {
      console.error('Error fetching staff plans:', error);
      throw error;
    }
  };

  const handleBulkDelete = (
    selectedRows: StaffPlan[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setSelectedRowsForDelete(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setShowDeleteDialog(true);
  };

  const confirmBulkDelete = () => {
    if (selectedRowsForDelete.length === 0) return;

    const ids = selectedRowsForDelete.map((row) => row.id);
    bulkDeleteMutation.mutate(ids);
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreateStaffPlan && (
        <Button
          onClick={() => router.push('/academic/staff-planning/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Create Staff Plan
        </Button>
      )}
      {canDeleteStaffPlan && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as StaffPlan[],
              props.resetSelection
            )
          }
          variant='destructive'
          size='sm'
          className='h-8'
          disabled={bulkDeleteMutation.isPending}
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          {bulkDeleteMutation.isPending
            ? 'Deleting...'
            : `Delete Selected (${props.selectedRows.length})`}
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
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'staff-plans',
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
          columnResizingTableId: 'staff-planning-table'
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRowsForDelete.length}{' '}
              staff plan{selectedRowsForDelete.length !== 1 ? 's' : ''}? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedRowsForDelete.length > 0 && (
            <div className='mt-3 p-3 bg-muted rounded-md'>
              <div className='text-sm font-medium mb-2'>
                Staff plans to be deleted:
              </div>
              <ul className='text-sm space-y-1 max-h-40 overflow-y-auto'>
                {selectedRowsForDelete.map((plan) => (
                  <li key={plan.id} className='truncate'>
                    • {plan.institution?.name} -{' '}
                    {plan.program?.program_name} -{' '}
                    {plan.semester?.semester_name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {bulkDeleteMutation.isPending
                ? 'Deleting...'
                : `Delete ${selectedRowsForDelete.length} Staff Plan${
                    selectedRowsForDelete.length !== 1 ? 's' : ''
                  }`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
