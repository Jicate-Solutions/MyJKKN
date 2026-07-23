'use client';

import { useCallback, useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
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
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { BillingCategory } from '@/types/billing';
import { getColumns } from './columns';

// Adapts the advanced (server-driven) DataTable to BillingCategoryService:
// maps {page,limit,search,sort_by,sort_order} → service filters and the
// service's {data,metadata} → the DataTable's {success,data,pagination} shape.
export function BillingCategoriesDataTable() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canDelete = isSuperAdmin || canAccess('billing.categories', 'delete');

  // Bump to force the DataTable to refetch (after a single- or bulk-delete).
  const [refetchKey, setRefetchKey] = useState(0);
  const refresh = () => setRefetchKey((k) => k + 1);

  const [bulkRows, setBulkRows] = useState<BillingCategory[]>([]);
  const [bulkResetFn, setBulkResetFn] = useState<(() => void) | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Stable identity (closes over no component state) so the DataTable refetches
  // only on real param changes (page/search/sort) + refetchKey — not on every
  // unrelated re-render such as opening the bulk-delete dialog.
  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const { data, metadata } =
        await BillingCategoryService.getBillingCategories({
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          sortBy: params.sort_by || undefined,
          sortOrder: (params.sort_order as 'asc' | 'desc') || undefined
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
    },
    []
  );

  const confirmBulkDelete = async () => {
    if (bulkRows.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const result = await BillingCategoryService.bulkDeleteBillingCategories(
        bulkRows.map((c) => c.id)
      );

      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} categor${
            result.success.length === 1 ? 'y' : 'ies'
          } deleted successfully`
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `Failed to delete ${result.failed.length} categor${
            result.failed.length === 1 ? 'y' : 'ies'
          } — ${result.failed[0].error}`
        );
      }

      bulkResetFn?.();
      setBulkRows([]);
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete categories'
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => getColumns({ onChanged: refresh })}
        idField='id'
        refetchKey={refetchKey}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: canDelete
        }}
        exportConfig={{
          entityName: 'billing categories',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        renderToolbarContent={({ selectedRows, resetSelection }) =>
          canDelete && selectedRows.length > 0 ? (
            <Button
              size='sm'
              variant='destructive'
              className='h-8'
              onClick={() => {
                setBulkRows(selectedRows as BillingCategory[]);
                setBulkResetFn(() => resetSelection);
              }}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Delete Selected ({selectedRows.length})
            </Button>
          ) : null
        }
      />

      <AlertDialog
        open={bulkRows.length > 0}
        onOpenChange={(o) => {
          if (!o) setBulkRows([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {bulkRows.length} categor{bulkRows.length === 1 ? 'y' : 'ies'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any that are referenced by existing student bills will be skipped.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isBulkDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
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
