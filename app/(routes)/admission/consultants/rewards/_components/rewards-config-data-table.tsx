'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ReferralRewardConfig } from '@/types/education-consultants';
import { useDeleteRewardConfig } from '@/hooks/admission/use-consultants';
import { RewardsConfigActionsProvider } from './rewards-config-context';
import { toast } from 'sonner';

interface RewardsConfigDataTableProps {
  institutionId: string;
  onCreateConfig: () => void;
  onEditConfig: (config: ReferralRewardConfig) => void;
}

export function RewardsConfigDataTable({
  institutionId,
  onCreateConfig,
  onEditConfig,
}: RewardsConfigDataTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('_all');
  const [typeFilter, setTypeFilter] = useState<string>('_all');
  const [refetchKey, setRefetchKey] = useState(0);

  // Bulk delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<ReferralRewardConfig[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteConfigMutation = useDeleteRewardConfig();

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
      const result = await ConsultantService.getRewardConfigsPaginated({
        institution_id: institutionId,
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sort_by: params.sort_by || 'created_at',
        sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
        status_filter:
          statusFilter && statusFilter !== '_all'
            ? (statusFilter as 'active' | 'inactive')
            : 'all',
        reward_type_filter:
          typeFilter && typeFilter !== '_all' ? typeFilter : undefined,
      });

      return {
        success: true,
        data: result.data || [],
        pagination: {
          page: result.metadata.page,
          limit: result.metadata.limit,
          total_pages: result.metadata.totalPages,
          total_items: result.metadata.total,
        },
      };
    } catch (error) {
      console.error('Error fetching reward configs:', error);
      throw error;
    }
  };

  const handleBulkDelete = (
    selectedRows: ReferralRewardConfig[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;
    setSelectedForDelete(selectedRows);
    setDeleteResetFn(() => resetSelection);
    setShowDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedForDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedForDelete.map((config) =>
          ConsultantService.deleteRewardConfig(config.id)
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Deleted ${successful} configuration${successful > 1 ? 's' : ''}`
        );
      }
      if (failed > 0) {
        toast.error(
          `Failed to delete ${failed} configuration${failed > 1 ? 's' : ''}`
        );
      }

      if (deleteResetFn) deleteResetFn();
      setRefetchKey((prev) => prev + 1);
      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting reward configs:', error);
      toast.error('An error occurred while deleting configurations');
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
    <div className="flex items-center gap-2 flex-wrap">
      <Button onClick={onCreateConfig} size="sm" className="h-8">
        <Plus className="mr-2 h-4 w-4" />
        New Config
      </Button>

      <Select
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={typeFilter}
        onValueChange={(value) => {
          setTypeFilter(value);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <SelectTrigger className="w-[150px] h-8">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Types</SelectItem>
          <SelectItem value="discount">Discount</SelectItem>
          <SelectItem value="fee_discount">Fee Discount</SelectItem>
          <SelectItem value="cashback">Cashback</SelectItem>
          <SelectItem value="cash">Cash</SelectItem>
          <SelectItem value="credit">Credit</SelectItem>
          <SelectItem value="credits">Credits</SelectItem>
          <SelectItem value="voucher">Voucher</SelectItem>
          <SelectItem value="merchandise">Merchandise</SelectItem>
        </SelectContent>
      </Select>

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as ReferralRewardConfig[],
              props.resetSelection
            )
          }
          variant="destructive"
          size="sm"
          className="h-8"
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          Delete ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  return (
    <RewardsConfigActionsProvider onEdit={onEditConfig}>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'reward-configs',
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
        refetchKey={refetchKey}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedForDelete.length} configuration
              {selectedForDelete.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected reward configurations
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedForDelete.length > 0 && (
            <div className="my-2 p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">
                Configuration{selectedForDelete.length > 1 ? 's' : ''} to
                delete:
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedForDelete.map((config) => (
                  <div key={config.id} className="text-sm">
                    &bull; {config.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RewardsConfigActionsProvider>
  );
}
