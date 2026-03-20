'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { RequestStatusBadge } from './request-status-badge';
import { PriorityBadge } from './priority-badge';
import { Eye, Pencil, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { ServiceRequest } from '@/types/service-request';
import { useCancelServiceRequest } from '@/hooks/service-requests/use-service-requests';

interface RequestDataTableProps {
  data: ServiceRequest[];
  isLoading?: boolean;
  showRequester?: boolean;
  showServiceType?: boolean;
  showEdit?: boolean;
  showCancel?: boolean;
}

export function RequestDataTable({
  data,
  isLoading,
  showRequester = true,
  showServiceType = true,
  showEdit = false,
  showCancel = false,
}: RequestDataTableProps) {
  const router = useRouter();
  const cancelRequest = useCancelServiceRequest();
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  const handleCancel = (id: string) => {
    cancelRequest.mutate({ id }, { onSuccess: () => setConfirmingCancelId(null) });
  };

  const columns = useMemo<ColumnDef<ServiceRequest>[]>(() => {
    const editableStatuses = ['draft', 'returned'];
    const cancellableStatuses = ['draft', 'returned', 'submitted'];
    const cols: ColumnDef<ServiceRequest>[] = [
      {
        accessorKey: 'request_number',
        header: 'Request #',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">
            {row.original.request_number}
          </span>
        ),
      },
    ];

    if (showServiceType) {
      cols.push({
        accessorKey: 'service_type.name',
        header: 'Service Type',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.service_type?.name || '-'}
          </span>
        ),
      });
    }

    if (showRequester) {
      cols.push({
        accessorKey: 'requester.full_name',
        header: 'Requester',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.requester?.full_name || '-'}
          </span>
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'submitted_at',
        header: 'Submitted',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.submitted_at
              ? format(new Date(row.original.submitted_at), 'MMM dd, yyyy')
              : '-'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const id = row.original.id;
          const isConfirming = confirmingCancelId === id;
          const isCancelling = cancelRequest.isPending && confirmingCancelId === id;

          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/service-requests/${id}`)}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              {showEdit && editableStatuses.includes(row.original.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/service-requests/${id}/edit`)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              {showCancel && cancellableStatuses.includes(row.original.status) && (
                isConfirming ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancel(id)}
                      disabled={isCancelling}
                    >
                      {isCancelling ? 'Cancelling...' : 'Confirm'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingCancelId(null)}
                      disabled={isCancelling}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmingCancelId(id)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )
              )}
            </div>
          );
        },
      }
    );

    return cols;
  }, [showRequester, showServiceType, showEdit, showCancel, router, confirmingCancelId, cancelRequest.isPending]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <p className="text-sm text-muted-foreground">Loading requests...</p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="request_number"
      searchPlaceholder="Search by request number..."
    />
  );
}
