'use client';

// fee-structures-list-view.tsx
//
// Heavyweight DataTable for /admission/settings/fees-structure (rewritten
// 2026-05-06 to match other admission modules — admission-years, leads).
// Supports URL state, server-side pagination, sortable columns, search,
// row selection, column visibility/resizing. Filters (institution, status)
// rendered via renderToolbarContent.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
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
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { columns, type FeeStructureRow } from './columns';

// Tiny helper that lives inside `renderCustomToolbar` and pushes the
// DataTable's selection state up to the parent. Without this we'd be stuck
// rendering the bulk-action UI inside the toolbar's right cluster (which is
// what made it cram against Export/View/Settings on the screenshot). The
// effect depends on rows.length (a primitive) — NOT the rows array — to avoid
// an infinite render loop when the DataTable hands back a fresh array each
// render. The latest array is captured via ref so the bulk-delete handler
// still operates on the current selection.
function BulkSelectionSync({
  rows,
  reset,
  rowsRef,
  onChange,
}: {
  rows: FeeStructureRow[];
  reset: () => void;
  rowsRef: React.MutableRefObject<FeeStructureRow[]>;
  onChange: (count: number, reset: () => void) => void;
}) {
  rowsRef.current = rows;
  const count = rows.length;
  useEffect(() => {
    onChange(count, reset);
  }, [count, reset, onChange]);
  return null;
}

export function FeeStructuresListView() {
  const router = useRouter();
  const { institutions } = useInstitutionsWithAccess();
  const { isSuperAdmin, canPerformAll } = usePermissions();
  const canBulkDelete = isSuperAdmin || canPerformAll('admission_fees', ['delete']);

  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refetchKey, setRefetchKey] = useState(0);

  // Bulk-selection state, lifted out of the toolbar so the bulk-action bar
  // can render as a FULL-WIDTH banner above the DataTable instead of
  // competing for horizontal space inside the toolbar's right cluster.
  const selectedRowsRef = useRef<FeeStructureRow[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [resetSelectionFn, setResetSelectionFn] = useState<() => void>(
    () => () => {},
  );
  const handleSelectionChange = useCallback(
    (count: number, reset: () => void) => {
      setSelectedCount(count);
      // Wrap in arrow so React doesn't invoke `reset` immediately when the
      // setter sees a function (state setter functional-update rule).
      setResetSelectionFn(() => reset);
    },
    [],
  );

  // Bulk-delete state. We capture the selected rows + the resetSelection
  // callback that the DataTable hands to renderToolbarContent so the dialog
  // — which renders OUTSIDE the toolbar tree — can both run the delete and
  // clear the selection on success.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [pendingRows, setPendingRows] = useState<FeeStructureRow[]>([]);
  const [pendingResetSelection, setPendingResetSelection] = useState<(() => void) | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const bumpRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  const handleBulkDelete = async () => {
    if (pendingRows.length === 0) return;
    setBulkSubmitting(true);
    // Promise.allSettled lets a per-row RLS denial or constraint failure on
    // one structure not abort the rest of the batch. Each fee structure has
    // its own ON DELETE CASCADE chain (items, communities junction), so a
    // partial success is the realistic outcome when the selection mixes
    // structures the caller can and can't delete.
    const results = await Promise.allSettled(
      pendingRows.map((r) => FeeStructureService.delete(r.id)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok > 0) {
      toast.success(`Deleted ${ok} fee structure${ok === 1 ? '' : 's'}`);
    }
    if (failed > 0) {
      const firstError = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      const reason = firstError?.reason;
      const detail =
        reason instanceof Error ? reason.message : String(reason ?? 'unknown');
      toast.error(
        `${failed} delete${failed === 1 ? '' : 's'} failed: ${detail}`,
      );
    }
    pendingResetSelection?.();
    bumpRefetch();
    setBulkSubmitting(false);
    setConfirmBulkDelete(false);
    setPendingRows([]);
    setPendingResetSelection(null);
  };

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      const { data, metadata } = await FeeStructureService.listAllPaginated({
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: institutionFilter === 'all' ? undefined : institutionFilter,
        status:
          statusFilter === 'all'
            ? undefined
            : (statusFilter as 'draft' | 'active' | 'archived'),
      });

      return {
        success: true,
        data: data as FeeStructureRow[],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    } catch (err) {
      console.error('Failed to fetch fee structures', err);
      throw err;
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: FeeStructureRow[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <>
      {/* Sync selection up to parent so the bulk-action bar can render as a
          full-width banner ABOVE the DataTable instead of cramming inside
          the toolbar's right cluster. */}
      <BulkSelectionSync
        rows={props.selectedRows}
        reset={props.resetSelection}
        rowsRef={selectedRowsRef}
        onChange={handleSelectionChange}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {/* Institution filter */}
        <Select
          value={institutionFilter}
          onValueChange={(v) => {
            setInstitutionFilter(v);
            bumpRefetch();
          }}
        >
          <SelectTrigger className="w-44 h-8">
            <SelectValue placeholder="All institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All institutions</SelectItem>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            bumpRefetch();
          }}
        >
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        {(institutionFilter !== 'all' || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setInstitutionFilter('all');
              setStatusFilter('all');
              bumpRefetch();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}

        <Button
          size="sm"
          className="h-8 ml-auto"
          onClick={() => router.push('/admission/settings/fees-structure/new')}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Fee Structure
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Full-width bulk-action banner — only renders once at least one row
          is selected and the caller holds admission_fees.delete. Sits ABOVE
          the DataTable so it never has to fight Export / View / Settings for
          horizontal space (the layout bug from screenshot 523). On narrow
          viewports the contents wrap with `flex-wrap` so the destructive
          button never gets clipped or overlapped. */}
      {selectedCount > 0 && canBulkDelete && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedCount} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => resetSelectionFn()}
            >
              Clear
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={() => {
              setPendingRows(selectedRowsRef.current);
              setPendingResetSelection(() => resetSelectionFn);
              setConfirmBulkDelete(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete {selectedCount}
          </Button>
        </div>
      )}

      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        refetchKey={refetchKey}
        idField="id"
        meta={{ onRefetch: bumpRefetch }}
        exportConfig={{
          entityName: 'fee-structures',
          columnMapping: {
            name: 'Name',
            institution_name: 'Institution',
            programme_name: 'Programme',
            admission_year_name: 'Admission Year',
            quota_name: 'Quota',
            community_name: 'Community',
            accommodation_name: 'Accommodation',
            item_count: 'Items',
            status: 'Status',
          },
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'fee-structures-table',
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingRows.length} fee structure
              {pendingRows.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected structure
              {pendingRows.length === 1 ? '' : 's'} and all line items.
              Already-resolved learners keep their snapshotted fee_items, but
              the structure rows themselves disappear from history.{' '}
              <strong>Cannot be undone.</strong> Use Archive (per-row) if you
              only want to stop using a structure for new enquiries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkSubmitting
                ? 'Deleting…'
                : `Delete ${pendingRows.length} permanently`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
