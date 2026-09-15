'use client';

// Column definitions for the Comp Off Claims advanced DataTable (2026-09-11).
//
// EVERY COLUMN CARRIES AN EXPLICIT size — see approval-queue-columns.tsx: the
// DataTable renders cells as `truncate max-w-0` sized from getSize(), whose
// TanStack default of 150px silently clips anything wider. The actions cell is
// a 32px three-dot menu (like the Leave tab), which cannot outgrow its cell;
// Radix portals the menu panel to the body so it is not clipped either.
//
// Rows arrive as CompOffClaimTableRow: labels and the punch check are
// precomputed by toTableRow(), so the sorter, the cells and the export agree.

import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, FileText, MoreHorizontal, RotateCcw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { cn } from '@/lib/utils';
import { biometricBlocksApproval, describeBiometric } from '@/types/hr-comp-off';
import { StatusBadge } from './request-table';
import { formatDays } from './format';
import { BADGE_STATUS, BIOMETRIC_TONE_CLASS } from './comp-off-claim-detail-sheet';
import { EXPIRING_WITHIN_DAYS, daysUntil, type CompOffClaimTableRow } from './comp-off-claims-filters';

export interface CompOffClaimActions {
  onView: (row: CompOffClaimTableRow) => void;
  onViewProof: (row: CompOffClaimTableRow) => void;
  onApprove: (row: CompOffClaimTableRow) => void;
  onReject: (row: CompOffClaimTableRow) => void;
  /** Opens the revoke confirmation for an APPROVED claim. */
  onRevoke: (row: CompOffClaimTableRow) => void;
  /** True while any decision is in flight — disables every row at once. */
  isPending: boolean;
  /** Local (IST) YYYY-MM-DD — the date the expiry rules are judged on. */
  today: string;
  /** The viewer's staff id; RLS refuses self-decisions. */
  ownStaffId: string | null | undefined;
}

export const fmtClaimDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB') : '—';

/** Why Approve is unavailable on this row, or null when it is available. */
export function approveBlockedReason(r: CompOffClaimTableRow, today: string): string | null {
  if (r.expires_on < today) return 'Expired — can only be rejected';
  if (biometricBlocksApproval(r.biometric_status)) {
    return describeBiometric({
      status: r.biometric_status!, in_at: null, out_at: null, source: null,
    })?.detail ?? null;
  }
  return null;
}

const selectColumn: ColumnDef<CompOffClaimTableRow> = {
  id: 'select',
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      aria-label="Select all"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(v) => row.toggleSelected(!!v)}
      aria-label="Select row"
    />
  ),
  size: 50,
  minSize: 50,
  maxSize: 50,
  enableSorting: false,
  enableHiding: false,
  enableResizing: false,
};

export function getCompOffClaimColumns(a: CompOffClaimActions): ColumnDef<CompOffClaimTableRow>[] {
  return [
    selectColumn,
    {
      accessorKey: 'employee_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Team member" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          // A real button: the row owns selection, so a row click handler would
          // fire on every checkbox tick.
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); a.onView(r); }}
            className="min-w-0 text-left"
            title={`View ${r.employee_name} claim details`}
          >
            <span className="block truncate font-medium underline-offset-4 hover:underline">
              {r.employee_name}
            </span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {r.employee_code ?? 'no staff ID'}
            </span>
          </button>
        );
      },
      size: 210,
      minSize: 160,
      enableHiding: false,
    },
    {
      accessorKey: 'institution_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.institution_name ?? '—'}</span>
      ),
      size: 200,
      minSize: 140,
    },
    {
      accessorKey: 'worked_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Worked date" />,
      cell: ({ row }) => fmtClaimDate(row.original.worked_date),
      size: 120,
      minSize: 110,
    },
    {
      accessorKey: 'location_label',
      meta: { label: 'Location' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      cell: ({ row }) => {
        const r = row.original;
        const bio = r.biometric_status
          ? describeBiometric({ status: r.biometric_status, in_at: null, out_at: null, source: null })
          : null;
        return (
          <div className="min-w-0">
            <span className={cn('block truncate', !r.work_location && 'text-muted-foreground')}>
              {r.location_label}
            </span>
            {r.work_place && (
              <span className="block truncate text-xs text-muted-foreground" title={r.work_place}>
                {r.work_place}
              </span>
            )}
            {r.biometric_label && bio && (
              <span
                className={cn('block truncate text-xs font-medium', BIOMETRIC_TONE_CLASS[bio.tone])}
                title={bio.detail}
              >
                {r.biometric_label}
              </span>
            )}
          </div>
        );
      },
      size: 200,
      minSize: 150,
    },
    {
      accessorKey: 'expires_on',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expires" />,
      cell: ({ row }) => {
        const r = row.original;
        const left = daysUntil(r.expires_on, a.today);
        const open = r.status === 'pending';
        return (
          <div className="min-w-0">
            <span className={cn(open && left < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
              {fmtClaimDate(r.expires_on)}
            </span>
            {open && left < 0 && (
              <span className="block text-xs font-medium text-red-600 dark:text-red-400">Expired</span>
            )}
            {open && left >= 0 && left <= EXPIRING_WITHIN_DAYS && (
              <span className="block text-xs text-amber-700 dark:text-amber-400">
                {left === 0 ? 'Last day' : `${left} day(s) left`}
              </span>
            )}
          </div>
        );
      },
      size: 130,
      minSize: 110,
    },
    {
      accessorKey: 'credit_days',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Days" />,
      cell: ({ row }) => <span className="tabular-nums">{formatDays(row.original.credit_days)}</span>,
      size: 80,
      minSize: 70,
    },
    {
      id: 'proof',
      meta: { label: 'Proof' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proof" />,
      cell: ({ row }) => {
        const r = row.original;
        const count = r.documents?.length ?? 0;
        if (count === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); a.onViewProof(r); }}
            title={count > 1 ? `View ${count} proof documents` : `View ${r.documents[0]?.name || 'the proof document'}`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-primary hover:bg-muted"
          >
            <FileText className="h-4 w-4" />
            <span className="text-xs underline-offset-4 hover:underline">
              {count > 1 ? `View (${count})` : 'View'}
            </span>
          </button>
        );
      },
      size: 100,
      minSize: 90,
      enableSorting: false,
    },
    {
      accessorKey: 'status_label',
      meta: { label: 'Status' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="min-w-0" title={r.rejection_reason ?? undefined}>
            <div className="flex flex-wrap items-center gap-1">
              <StatusBadge status={BADGE_STATUS[r.status]} revoked={r.revoked_at !== null} />
              {r.status === 'consumed' && (
                <Badge variant="outline" className="font-normal text-muted-foreground">used</Badge>
              )}
              {r.status === 'pending' && r.employee_id === a.ownStaffId && (
                <Badge variant="outline" className="border-amber-300 text-amber-800">Yours</Badge>
              )}
            </div>
            {r.decided_at && (
              <span className="block truncate text-xs text-muted-foreground">
                {fmtClaimDate(r.decided_at)}
              </span>
            )}
          </div>
        );
      },
      size: 150,
      minSize: 120,
    },
    
    {
      // One 32px trigger, fixed and unshrinkable, so it can never clip.
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => <CompOffClaimRowActions row={row.original} actions={a} />,
      size: 90,
      minSize: 90,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
  ];
}

/**
 * The row's three-dot menu — same pattern as approval-row-actions.tsx on the
 * Leave tab. Approve and Reject each open their confirmation dialog.
 *
 * Every handler is deferred a tick: a dialog must not open synchronously while
 * the menu is closing — the stuck `pointer-events: none` body documented in
 * .claude/skills/radix-dialog-race-fix.
 *
 * Approve is DISABLED, never hidden, when the database would refuse it, with the
 * reason directly under it — hiding it would read as "you may not decide this",
 * which is a different and wrong explanation.
 */
export function CompOffClaimRowActions({
  row,
  actions,
}: {
  row: CompOffClaimTableRow;
  actions: CompOffClaimActions;
}) {
  const later = (fn: (r: CompOffClaimTableRow) => void) => () => { setTimeout(() => fn(row), 0); };
  const pending = row.status === 'pending';
  const own = row.employee_id === actions.ownStaffId;
  const blocked = approveBlockedReason(row, actions.today);
  const proofs = row.documents?.length ?? 0;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            aria-label={`Actions for ${row.employee_name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-[230px]">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {row.employee_name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={later(actions.onView)}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
          {proofs > 0 && (
            <DropdownMenuItem onSelect={later(actions.onViewProof)}>
              <FileText className="mr-2 h-4 w-4" />
              {proofs > 1 ? `View proof (${proofs})` : 'View proof'}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          {/*
            REVOKE — the one action a decided claim still has. 'consumed' is
            deliberately NOT offered: that credit has already been spent by a
            booked leave, and taking it back on its own would leave that leave
            standing on a credit that no longer exists. The dialog asks Postgres,
            which names the leave to revoke first.
          */}
          {row.status === 'approved' && row.revoked_at === null && !own && (
            <>
              <DropdownMenuItem
                disabled={actions.isPending}
                onSelect={later(actions.onRevoke)}
                className="text-amber-700 focus:text-amber-700 dark:text-amber-400"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Revoke approval…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {!pending ? (
            <DropdownMenuItem disabled>Already decided</DropdownMenuItem>
          ) : own ? (
            <DropdownMenuItem disabled>Your own claim — another approver must decide</DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                disabled={actions.isPending || blocked !== null}
                onSelect={later(actions.onApprove)}
                className="text-emerald-700 focus:text-emerald-700"
              >
                <Check className="mr-2 h-4 w-4" />
                Approve…
              </DropdownMenuItem>
              {blocked && (
                <DropdownMenuLabel className="whitespace-normal py-1 text-xs font-normal leading-snug text-red-700 dark:text-red-400">
                  {blocked}
                </DropdownMenuLabel>
              )}
              <DropdownMenuItem
                disabled={actions.isPending}
                onSelect={later(actions.onReject)}
                className="text-destructive focus:text-destructive"
              >
                <X className="mr-2 h-4 w-4" />
                Reject…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
