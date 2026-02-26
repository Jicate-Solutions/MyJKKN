/**
 * Server-rendered Profiles Table with Client Selection
 *
 * Hybrid component: Renders on server but supports client-side row selection.
 * Uses the existing DataTable component for advanced features.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { profileColumns } from './columns';
import type { LearnerProfile } from '@/types/learner-profile';
import { Button } from '@/components/ui/button';
import { TrashIcon, ArrowRight, ArrowUpDown } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useRouter, useSearchParams } from 'next/navigation';

const SORT_OPTIONS = [
  { value: 'first_name_asc',   label: 'Name (A → Z)',        sortBy: 'first_name',  sortOrder: 'asc'  },
  { value: 'first_name_desc',  label: 'Name (Z → A)',        sortBy: 'first_name',  sortOrder: 'desc' },
  { value: 'roll_number_asc',  label: 'Roll No. (A → Z)',    sortBy: 'roll_number', sortOrder: 'asc'  },
  { value: 'roll_number_desc', label: 'Roll No. (Z → A)',    sortBy: 'roll_number', sortOrder: 'desc' },
] as const;

interface ProfilesTableServerProps {
  initialData: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  statusFilter?: 'active' | 'inactive' | 'exited';
}

/**
 * Profiles Table with Server-Side Data
 *
 * Receives pre-fetched data from server component but maintains
 * client-side selection and bulk operations for UX.
 */
export function ProfilesTableServer({
  initialData,
  metadata,
  statusFilter
}: ProfilesTableServerProps) {
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [learnersToDelete, setLearnersToDelete] = useState<LearnerProfile[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{
    current: number;
    total: number;
    currentId: string;
  }>({ current: 0, total: 0, currentId: '' });

  // Local state for optimistic updates
  const [localData, setLocalData] = useState<LearnerProfile[]>(initialData);
  const [localMetadata, setLocalMetadata] = useState(metadata);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Permission check - Super admin has full access, others need 'learners.delete' permission
  const { isSuperAdmin, canAccess } = usePermissions();

  // Derive current sort selection from URL params (server-side sort keys)
  const currentSortBy = searchParams.get('sort_by') || 'first_name';
  const currentSortOrder = searchParams.get('sort_order') || 'asc';
  const currentSort =
    SORT_OPTIONS.find(
      (o) => o.sortBy === currentSortBy && o.sortOrder === currentSortOrder
    )?.value ?? 'first_name_asc';

  const handleSortChange = (value: string) => {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort_by', option.sortBy);
    params.set('sort_order', option.sortOrder);
    params.set('page', '1'); // reset to first page on sort change
    router.push(`?${params.toString()}`);
  };
  const canDeleteLearners = isSuperAdmin || canAccess('learners', 'delete');

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
    setDeleteProgress({ current: 0, total: learnersToDelete.length, currentId: '' });

    try {
      const result = await LearnerProfileService.bulkDeleteLearnerProfiles(
        learnersToDelete.map((learner) => learner.id),
        (current, total, currentId) => {
          // Update progress in real-time
          setDeleteProgress({ current, total, currentId });
        }
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
          `${success.length} student${success.length > 1 ? 's' : ''} deleted successfully`,
          { duration: 4000 }
        );
        // Refresh server data in background without causing auth errors
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else if (success.length > 0 && failed.length > 0) {
        toast.success(
          `${success.length} student${success.length > 1 ? 's' : ''} deleted successfully`,
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
        {/* Sort selector — always visible in the toolbar */}
        <Select value={currentSort} onValueChange={handleSortChange}>
          <SelectTrigger className="h-8 w-[165px] text-xs">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk actions — shown only when rows are selected */}
        {props.selectedRows.length > 0 && (
          <>
            <Button asChild size="sm" className="h-8">
              <Link href={`/learners/profiles/promotion?ids=${selectedIds}`}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Promote Selected ({props.selectedRows.length})
              </Link>
            </Button>
            {canDeleteLearners && (
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
          entityName: `${statusFilter || 'all'}-students`,
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
              {isDeleting
                ? `Deleting ${deleteProgress.current} of ${deleteProgress.total} records...`
                : `Delete ${learnersToDelete.length} record${learnersToDelete.length > 1 ? 's' : ''}?`
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDeleting
                ? 'Please wait while we delete the selected records. Do not close this dialog.'
                : `This action cannot be undone. This will permanently delete the selected student profile${learnersToDelete.length > 1 ? 's' : ''} and remove all associated data.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Progress UI - Outside AlertDialogDescription to avoid hydration error */}
          {isDeleting && (
            <div className="space-y-2 px-6 pb-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-muted-foreground">Progress:</span>
                <span className="text-muted-foreground">
                  {deleteProgress.current} / {deleteProgress.total}
                </span>
              </div>
              <Progress
                value={(deleteProgress.current / deleteProgress.total) * 100}
                className="h-2"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Deleting...
                </span>
              ) : (
                'Delete All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
