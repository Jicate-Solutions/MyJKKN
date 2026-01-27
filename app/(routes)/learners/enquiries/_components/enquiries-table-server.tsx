/**
 * Server-rendered Enquiries Table with Client Selection
 *
 * Hybrid component: Renders on server but supports client-side row selection.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { enquiryColumns } from './columns';
import type { LearnerProfile } from '@/types/learner-profile';
import { Button } from '@/components/ui/button';
import { TrashIcon } from 'lucide-react';
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
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useRouter } from 'next/navigation';

interface EnquiriesTableServerProps {
  initialData: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  statusFilter?: 'enquiry' | 'pending' | 'rejected' | 'waitlisted';
}

/**
 * Enquiries Table with Server-Side Data
 *
 * Receives pre-fetched data from server component
 */
export function EnquiriesTableServer({
  initialData,
  metadata,
  statusFilter
}: EnquiriesTableServerProps) {
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [learnersToDelete, setLearnersToDelete] = useState<LearnerProfile[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Local state for optimistic updates
  const [localData, setLocalData] = useState<LearnerProfile[]>(initialData);
  const [localMetadata, setLocalMetadata] = useState(metadata);

  const router = useRouter();

  // Permission check - Super admin has full access, others need 'learners.admissions.delete' permission
  const { isSuperAdmin, canAccess } = usePermissions();
  const canDeleteLearners = isSuperAdmin || canAccess('learners.admissions', 'delete');

  // Update local data when props change
  useEffect(() => {
    setLocalData(initialData);
    setLocalMetadata(metadata);
  }, [initialData, metadata]);

  /**
   * Fetch data function for DataTable
   * Uses local state for optimistic updates
   */
  const fetchData = useCallback(async () => {
    return {
      success: true,
      data: localData,
      pagination: localMetadata
    };
  }, [localData, localMetadata]);

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

      // Optimistically update local data by removing successfully deleted items
      if (success.length > 0) {
        const deletedIds = new Set(success);
        const updatedData = localData.filter(item => !deletedIds.has(item.id));
        setLocalData(updatedData);

        // Update metadata
        setLocalMetadata(prev => ({
          ...prev,
          total_items: prev.total_items - success.length
        }));
      }

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
          `${success.length} enquiry record${success.length > 1 ? 's' : ''} deleted successfully`,
          { duration: 4000 }
        );
        // Refresh server data in background without causing auth errors
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} enquiry record${success.length > 1 ? 's' : ''} deleted successfully`,
          { duration: 4000 }
        );
        toast.error(
          `Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`,
          { duration: 5000 }
        );
        // Refresh to get accurate state
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else if (failed.length > 0) {
        toast.error(
          `Failed to delete ${failed.length} record${failed.length > 1 ? 's' : ''}`,
          { duration: 5000 }
        );
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
  }) => {
    return (
      <div className="flex items-center gap-2">
        {props.selectedRows.length > 0 && canDeleteLearners && (
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
  };

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => enquiryColumns as any}
        exportConfig={{
          entityName: `${statusFilter || 'all'}-enquiries`,
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
          enableSearch: false, // Disabled - using custom advanced search instead
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
              enquiry record{learnersToDelete.length > 1 ? 's' : ''} and remove all
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
