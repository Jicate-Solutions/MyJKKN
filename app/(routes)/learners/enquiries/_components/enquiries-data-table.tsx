// ============================================
// ENQUIRIES DATA TABLE COMPONENT
// ============================================
// Created: 2025-01-18
// Purpose: TanStack Table for enquiries and pending applications
// ============================================

'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { enquiryColumns } from './columns';
import type { EnquiriesSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { TrashIcon } from 'lucide-react';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LearnerProfile } from '@/types/learner-profile';
import { toast } from 'sonner';
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

interface EnquiriesDataTableProps {
  search: EnquiriesSearchParams;
  /**
   * Filter by lifecycle status
   * - 'enquiry': Only enquiries
   * - 'pending': Only pending applications
   * - undefined: Both
   */
  statusFilter?: 'enquiry' | 'pending';
}

/**
 * EnquiriesDataTable Component
 *
 * Advanced data table for enquiries and pending applications using TanStack Table
 *
 * Features:
 * - Server-side pagination
 * - Multi-column sorting
 * - Advanced filtering
 * - Row selection with bulk operations
 * - Bulk delete with confirmation
 * - URL state management
 */
export function EnquiriesDataTable({
  search,
  statusFilter,
}: EnquiriesDataTableProps) {
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [learnersToDelete, setLearnersToDelete] = useState<LearnerProfile[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Fetch data function for DataTable
   * Maps URL params to service filters
   */
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
        // Lifecycle status filter - use either statusFilter prop or URL param
        lifecycleStatus: statusFilter || search.lifecycle_status || undefined,
        // Institution filters
        institutionId: search.institution_id,
        departmentId: search.department_id,
        programId: search.program_id,
        // Date range
        fromDate: params.from_date || undefined,
        toDate: params.to_date || undefined,
      };

      const result = await LearnerProfileService.getLearnerProfiles(filters);

      const { data, metadata } = result;

      return {
        success: true,
        data: data || [],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    } catch (error) {
      console.error('[learners/enquiries] Error fetching data:', error);
      toast.error('Failed to load data', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      throw error;
    }
  };

  /**
   * Handle bulk delete action
   */
  const handleBulkDelete = (
    selectedRows: LearnerProfile[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setLearnersToDelete(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setShowBulkDeleteDialog(true);
  };

  /**
   * Confirm and execute bulk delete
   */
  const confirmBulkDelete = async () => {
    if (learnersToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const result = await LearnerProfileService.bulkDeleteLearnerProfiles(
        learnersToDelete.map((learner) => learner.id)
      );

      const { success, failed } = result;

      // Reset selection
      if (resetSelectionFn) {
        resetSelectionFn();
      }

      // Close dialog
      setShowBulkDeleteDialog(false);
      setLearnersToDelete([]);
      setResetSelectionFn(null);

      // Show results
      if (success.length > 0 && failed.length === 0) {
        toast.success(
          `${success.length} enquir${success.length > 1 ? 'ies' : 'y'} deleted successfully`
        );
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} enquir${success.length > 1 ? 'ies' : 'y'} deleted successfully`
        );
        toast.error(`Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`);
      } else if (failed.length > 0) {
        toast.error(`Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('[learners/enquiries] Error deleting records:', error);
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
  }) => (
    <div className="flex items-center gap-2">
      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(props.selectedRows as LearnerProfile[], props.resetSelection)
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

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => enquiryColumns as any}
        exportConfig={{
          entityName: statusFilter === 'pending' ? 'pending-applications' : 'enquiries',
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
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {learnersToDelete.length} record{learnersToDelete.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected{' '}
              {statusFilter === 'pending' ? 'applications' : 'enquiries'} and remove all
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
