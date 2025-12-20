// ============================================
// PROFILES DATA TABLE COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: TanStack Table for active learner profiles
// ============================================

'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { profileColumns } from './columns';
import type { ProfilesSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { TrashIcon, ArrowRight } from 'lucide-react';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LearnerProfile, LifecycleStatus } from '@/types/learner-profile';
import { toast } from 'sonner';
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

interface ProfilesDataTableProps {
  search: ProfilesSearchParams;
  statusFilter?: 'active' | 'inactive' | 'exited';
}

/**
 * ProfilesDataTable Component
 *
 * Advanced data table for learner profiles using TanStack Table
 *
 * Features:
 * - Server-side pagination
 * - Multi-column sorting
 * - Advanced filtering
 * - Row selection with bulk operations
 * - Bulk delete with confirmation
 * - URL state management
 */
export function ProfilesDataTable({ search, statusFilter }: ProfilesDataTableProps) {
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
        lifecycle_status: (statusFilter || search.lifecycle_status || undefined) as LifecycleStatus | undefined,
        // Organization hierarchy filters
        institution_id: search.institution_id,
        degree_id: search.degree_id,
        department_id: search.department_id,
        program_id: search.program_id,
        semester_id: search.semester_id,
        section_id: search.section_id,
        academic_year_id: search.academic_year_id,
        gender: search.gender,
        is_profile_complete: search.is_profile_complete ? search.is_profile_complete === 'true' : undefined,
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
      console.error('[learners/profiles] Error fetching data:', error);
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
          `${success.length} student${success.length > 1 ? 's' : ''} deleted successfully`
        );
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} student${success.length > 1 ? 's' : ''} deleted successfully`
        );
        toast.error(`Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`);
      } else if (failed.length > 0) {
        toast.error(`Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('[learners/profiles] Error deleting records:', error);
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
    const selectedIds = props.allSelectedIds.join(',');

    return (
      <div className="flex items-center gap-2">
        {props.selectedRows.length > 0 && (
          <>
            <Button asChild size="sm" className="h-8">
              <Link href={`/learners/profiles/promotion?ids=${selectedIds}`}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Promote Selected ({props.selectedRows.length})
              </Link>
            </Button>
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
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => profileColumns as any}
        exportConfig={{
          entityName: 'active-students',
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
              This action cannot be undone. This will permanently delete the selected
              student profile{learnersToDelete.length > 1 ? 's' : ''} and remove all
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
