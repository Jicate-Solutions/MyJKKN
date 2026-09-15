'use client';

/**
 * Columns for the warden's gate-pass queue.
 *
 * Every column is sortable and hideable through the shared advanced DataTable,
 * which also owns search, URL state, column resizing and CSV/XLS export. The
 * page that used to live here hand-rolled a <Table> with a client-side
 * `.filter()` and an "Export ships next" stub toast.
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Eye, PhoneCall, X } from 'lucide-react';
import type { GatePassListRow, GatePassStatus } from '@/types/campus-living';

/** One vocabulary for the seven statuses, used by the queue and the detail page. */
export const GATE_PASS_STATUS_CONFIG: Record<
  GatePassStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }
> = {
  requested: { label: 'Pending', variant: 'outline' },
  issued: { label: 'Approved', variant: 'default' },
  active: { label: 'Out now', variant: 'default' },
  returned: { label: 'Returned', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

export function formatMoment(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface ColumnOptions {
  canDecide: boolean;
  onApprove: (row: GatePassListRow) => void;
  onReject: (row: GatePassListRow) => void;
}

export function getGatePassColumns({
  canDecide,
  onApprove,
  onReject,
}: ColumnOptions): ColumnDef<GatePassListRow>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'learner_name',
      header: 'Learner',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.learner_name}</p>
          {row.original.learner_email && (
            <p className="truncate text-xs text-muted-foreground">
              {row.original.learner_email}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'leave_type_name',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="secondary" className="whitespace-nowrap">
          {row.original.leave_type_name}
        </Badge>
      ),
    },
    {
      accessorKey: 'destination',
      header: 'Destination',
      cell: ({ row }) => (
        <span className="block max-w-[16rem] truncate">{row.original.destination}</span>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="block max-w-[18rem] truncate text-muted-foreground">
          {row.original.reason ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'planned_out_at',
      header: 'Planned out',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {formatMoment(row.original.planned_out_at)}
        </span>
      ),
    },
    {
      accessorKey: 'expected_return',
      header: 'Due back',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {formatMoment(row.original.expected_return)}
        </span>
      ),
    },
    {
      accessorKey: 'out_time',
      header: 'Left at',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">{formatMoment(row.original.out_time)}</span>
      ),
    },
    {
      accessorKey: 'actual_return',
      header: 'Back at',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {formatMoment(row.original.actual_return)}
        </span>
      ),
    },
    {
      accessorKey: 'parent_confirmed_at',
      header: 'Parent called',
      cell: ({ row }) =>
        row.original.parent_confirmed_at ? (
          <span className="flex items-center gap-1 whitespace-nowrap text-xs text-green-700 dark:text-green-400">
            <PhoneCall className="h-3 w-3" />
            {formatMoment(row.original.parent_confirmed_at)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not yet</span>
        ),
    },
    {
      accessorKey: 'pass_number',
      header: 'Pass no.',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.pass_number ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg = GATE_PASS_STATUS_CONFIG[row.original.status] ?? {
          label: row.original.status,
          variant: 'outline' as const,
        };
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const isPending = row.original.status === 'requested';
        return (
          <div className="flex items-center justify-end gap-1">
            {/* Approve and Reject are shortcuts, not the main path. The
                decision the warden is meant to take is on the detail page,
                where the learner's dossier and the parent's number are. */}
            {canDecide && isPending && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                  onClick={() => onApprove(row.original)}
                >
                  <Check className="h-4 w-4" />
                  <span className="sr-only">Approve</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => onReject(row.original)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Reject</span>
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-8" asChild>
              <Link href={`/campus-living/gate-passes/${row.original.id}`}>
                <Eye className="mr-1 h-4 w-4" />
                View
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];
}
