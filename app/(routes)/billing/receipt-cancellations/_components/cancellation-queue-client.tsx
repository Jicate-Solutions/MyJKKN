'use client';

import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import type { DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ReceiptCancellationService } from '@/lib/services/billing/receipts/receipt-cancellation-service';
import type {
  CancelRequestStatus,
  ReceiptCancelRequest,
} from '@/lib/services/billing/receipts/receipt-cancellation-service';
import {
  getCancellationColumns,
  toCancellationRow,
  type CancellationRow,
} from './cancellation-columns';
import { CancellationDetailDialog } from './cancellation-detail-dialog';

const STATUSES: Array<{ key: CancelRequestStatus | 'all'; label: string }> = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
  { key: 'withdrawn', label: 'Withdrawn' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All' },
];

export function CancellationQueueClient() {
  const [status, setStatus] = useState<CancelRequestStatus | 'all'>('pending_approval');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumped to force DataTable to refetch after a decision changes a row.
  const [refreshToken, setRefreshToken] = useState(0);

  // The table renders flat rows (ExportableData is scalars-only), but the
  // dialog needs the whole request. Hold the last page's full objects so the
  // dialog opens from data already in hand instead of re-querying one row.
  // State, not a ref: `selectedRequest` is derived during render, and reading
  // a ref there would not re-render when the page changes under it.
  const [rawRequests, setRawRequests] = useState<ReceiptCancelRequest[]>([]);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      // Read so this callback's identity genuinely changes when a decision
      // lands — DataTable refetches when fetchDataFn changes, and that is the
      // only way to pull a decided row out of the Pending list.
      void refreshToken;

      const { data, total } = await ReceiptCancellationService.listRequestsPaged({
        page: params.page,
        limit: params.limit,
        search: params.search,
        status,
        sortBy: params.sort_by,
        sortOrder: params.sort_order === 'asc' ? 'asc' : 'desc',
      });

      setRawRequests(data);

      const limit = params.limit || 10;
      return {
        success: true,
        data: data.map(toCancellationRow),
        pagination: {
          page: params.page,
          limit,
          total_items: total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    },
    [status, refreshToken]
  );

  const columns = useMemo(
    () => getCancellationColumns((id) => setSelectedId(id)),
    []
  );

  const selectedRequest = selectedId
    ? (rawRequests.find((r) => r.id === selectedId) ?? null)
    : null;

  const renderToolbar = useCallback(
    () => (
      <div className='flex flex-wrap gap-2'>
        {STATUSES.map((s) => (
          <Button
            key={s.key}
            size='sm'
            variant={status === s.key ? 'default' : 'outline'}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>
    ),
    [status]
  );

  return (
    <>
      <DataTable<CancellationRow, unknown>
        key={status}
        getColumns={() => columns}
        fetchDataFn={fetchData}
        idField='id'
        exportConfig={{
          entityName: 'receipt-cancellations',
          columnMapping: {
            request_number: 'Request',
            receipt_number: 'Receipt',
            amount: 'Amount',
            reason: 'Reason',
            requested_by_name: 'Raised By',
            requested_by_role: 'Raised By Role',
            requested_at: 'Raised On',
            status: 'Status',
          },
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableRowSelection: false,
          enableSearch: true,
          enablePagination: true,
          enableColumnVisibility: true,
          enableColumnFilters: false,
          enableDateFilter: false,
          enableExport: true,
          enableUrlState: false,
          enableColumnResizing: true,
          columnResizingTableId: 'receipt-cancellations-table',
        }}
        renderToolbarContent={renderToolbar}
      />

      <CancellationDetailDialog
        request={selectedRequest}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onActed={() => setRefreshToken((n) => n + 1)}
      />
    </>
  );
}
