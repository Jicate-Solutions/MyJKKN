/**
 * Server-rendered Timetables Table with Client Selection
 *
 * Hybrid component: Renders on server but supports client-side row selection.
 * Uses the existing DataTable component for advanced features.
 */

'use client';

import { useState, useCallback } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { Timetable } from '@/types/academics';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon } from 'lucide-react';
import Link from 'next/link';
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
import { TimetableService } from '@/lib/services/academic/timetable-service';
import toast from 'react-hot-toast';

interface TimetablesTableServerProps {
  timetables: Timetable[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
  };
}

/**
 * Timetables Table with Server-Side Data
 *
 * Receives pre-fetched data from server component but maintains
 * client-side selection and bulk operations for UX.
 *
 * CRITICAL FIX (2025-12-31):
 * - fetchData now depends on timetables/metadata props
 * - When server re-renders with new filter data, fetchData changes
 * - This triggers DataTable's useEffect to re-fetch and display new data
 */
export function TimetablesTableServer({
  timetables,
  metadata
}: TimetablesTableServerProps) {
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [timetablesToDelete, setTimetablesToDelete] = useState<Timetable[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Fetch data function for DataTable
   *
   * CRITICAL: This callback MUST depend on timetables and metadata props.
   * When server component re-renders with new filtered data:
   * 1. Props change → fetchData reference changes
   * 2. DataTable's useEffect detects fetchDataFn change
   * 3. useEffect triggers → calls fetchData → updates DataTable state
   * 4. New filtered data is displayed
   *
   * Previously used refs with empty deps [], which caused stale data issue
   * because DataTable's useEffect didn't know props had changed.
   */
  const fetchData = useCallback(async () => {
    // Return current props directly - no refs needed
    // This ensures DataTable always gets fresh data
    return {
      success: true,
      data: timetables,
      pagination: {
        page: metadata.page,
        limit: metadata.pageSize,
        total_pages: Math.ceil(metadata.total / metadata.pageSize),
        total_items: metadata.total
      }
    };
  }, [timetables, metadata]); // CRITICAL: Depend on props so callback changes when data changes

  /**
   * Handle bulk delete action
   */
  const handleBulkDelete = (
    selectedRows: Timetable[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setTimetablesToDelete(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setShowBulkDeleteDialog(true);
  };

  /**
   * Confirm and execute bulk delete
   */
  const confirmBulkDelete = async () => {
    if (timetablesToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const result = await TimetableService.bulkDeleteTimetables(
        timetablesToDelete.map((timetable) => timetable.id)
      );

      const { success, failed } = result;

      // Reset selection
      if (resetSelectionFn) {
        resetSelectionFn();
      }

      // Close dialog
      setShowBulkDeleteDialog(false);
      setTimetablesToDelete([]);
      setResetSelectionFn(null);

      // Show results
      if (success.length > 0 && failed.length === 0) {
        toast.success(
          `${success.length} timetable${success.length > 1 ? 's' : ''} deleted successfully`
        );
        // Refresh the page to show updated data
        window.location.reload();
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} timetable${success.length > 1 ? 's' : ''} deleted successfully`
        );
        toast.error(`Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`);
        window.location.reload();
      } else if (failed.length > 0) {
        toast.error(`Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('[academic/timetables] Error deleting records:', error);
      toast.error('Failed to delete records. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Custom toolbar with bulk actions
   */
  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => {
    return (
      <div className="flex items-center gap-2">
        <Button asChild size="sm" className="h-8">
          <Link href="/academic/timetables/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Timetable
          </Link>
        </Button>

        {props.selectedRows.length > 0 && (
          <Button
            onClick={() =>
              handleBulkDelete(props.selectedRows as Timetable[], props.resetSelection)
            }
            variant="destructive"
            size="sm"
            className="h-8"
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Delete Selected ({props.selectedRows.length})
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'timetables',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        idField="id"
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {timetablesToDelete.length} record{timetablesToDelete.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected
              timetable{timetablesToDelete.length > 1 ? 's' : ''} and remove all
              associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
