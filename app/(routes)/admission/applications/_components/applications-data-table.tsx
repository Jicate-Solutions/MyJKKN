'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns, APPLICATION_STATUSES } from './columns';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApplicationService } from '@/lib/services/admission/application-service';
import type { AdmissionApplication } from '@/types/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useApplicationMutations } from '@/hooks/admission';
import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import toast from 'react-hot-toast';

export function ApplicationsDataTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const { updateApplicationStatus } = useApplicationMutations();
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [selectedForAction, setSelectedForAction] = useState<AdmissionApplication[]>([]);
  const [bulkResetFn, setBulkResetFn] = useState<(() => void) | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Status filter from URL
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get('status') || '_all'
  );

  const institutionId = profile?.institution_id;

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
      const result = await ApplicationService.getApplications({
        institutionId: institutionId || '',
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sort_by: params.sort_by || 'created_at',
        sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
        date_from: params.from_date || undefined,
        date_to: params.to_date || undefined,
        status:
          statusFilter && statusFilter !== '_all'
            ? statusFilter
            : undefined
      });

      return {
        success: true,
        data: result.data || [],
        pagination: {
          page: result.metadata.page,
          limit: result.metadata.limit,
          total_pages: result.metadata.totalPages,
          total_items: result.metadata.total
        }
      };
    } catch (error) {
      console.error('Error fetching applications:', error);
      throw error;
    }
  };

  const handleBulkWithdraw = async (
    selectedRows: AdmissionApplication[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;
    setSelectedForAction(selectedRows);
    setBulkResetFn(() => resetSelection);
    setShowBulkDialog(true);
  };

  const confirmBulkWithdraw = async () => {
    if (selectedForAction.length === 0) return;

    setIsProcessing(true);
    try {
      const results = await Promise.allSettled(
        selectedForAction.map((app) =>
          ApplicationService.updateStatus(app.id, 'withdrawn')
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Withdrew ${successful} application${successful > 1 ? 's' : ''}`
        );
      }
      if (failed > 0) {
        toast.error(
          `Failed to withdraw ${failed} application${failed > 1 ? 's' : ''}`
        );
      }

      if (bulkResetFn) bulkResetFn();
      setRefetchKey((prev) => prev + 1);
      setShowBulkDialog(false);
      setSelectedForAction([]);
      setBulkResetFn(null);
    } catch (error) {
      console.error('Error withdrawing applications:', error);
      toast.error('An error occurred while withdrawing applications');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <SelectTrigger className="w-[180px] h-8">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Statuses</SelectItem>
          {APPLICATION_STATUSES.map((status) => (
            <SelectItem key={status.value} value={status.value}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkWithdraw(
              props.selectedRows as AdmissionApplication[],
              props.resetSelection
            )
          }
          variant="destructive"
          size="sm"
          className="h-8"
        >
          Withdraw ({props.selectedRows.length})
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
          entityName: 'applications',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true
        }}
        renderToolbarContent={renderCustomToolbar}
        refetchKey={refetchKey}
      />

      <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Withdraw {selectedForAction.length} application
              {selectedForAction.length > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the selected application
              {selectedForAction.length > 1 ? 's' : ''} as withdrawn. You can
              change their status back later.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedForAction.length > 0 && (
            <div className="my-2 p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">
                Application{selectedForAction.length > 1 ? 's' : ''} to
                withdraw:
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedForAction.map((app) => (
                  <div key={app.id} className="text-sm">
                    &bull; {app.application_number || app.id.slice(0, 8)} -{' '}
                    {app.full_name || (app as any).form_data?.full_name || 'Unknown'}
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkWithdraw}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Withdraw`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
