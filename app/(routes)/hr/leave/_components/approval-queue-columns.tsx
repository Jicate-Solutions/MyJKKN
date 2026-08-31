'use client';

// Column definitions for the HR Leave Approvals advanced DataTable.
// Created 2026-08-20, when the queue moved off the plain RequestTable.
//
// TWO SHAPES, ONE ROW TYPE. Leave and Short Time Off are the same
// hr_leave_applications rows and differ only by the type's request_category,
// but they are not measurable in the same units: an hourly permission has a
// meaningless total_days of "0.13" and a full-day leave has no start_time. The
// old queue rendered both through one day-count table, which is why 240 pending
// hourly requests read as fractional leave. Separate columns, one row type.
//
// EVERY COLUMN CARRIES AN EXPLICIT size. The advanced DataTable renders each
// body cell as `px-4 py-2 truncate max-w-0` and sizes the column from
// header.getSize(), whose TanStack default is 150px — so any cell wider than
// its column is silently clipped. That is what hid the Approve button when
// actions were a pair of inline buttons: ~200px of content, justify-end, so the
// overflow fell off the LEFT and Reject looked like the only option. Actions
// are now a 32px three-dot trigger (approval-row-actions.tsx) which cannot
// outgrow its cell, and Radix portals the menu panel to the body so it is not
// clipped either. The explicit sizes stay regardless — a ten-column table left
// at the 150px default is arbitrary, not designed.

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { ApprovalRowActions, type ApprovalRowActionHandlers } from './approval-row-actions';
import { StatusBadge } from './request-table';
import { formatBiometricGap, formatDays, formatHours } from './format';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

export type { ApprovalRowActionHandlers };

/** What every row's menu needs. Shared by the table and the mobile card. */
export type ApprovalColumnActions = ApprovalRowActionHandlers;

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

/** 'HH:MM:SS' -> 'HH:MM'. The column is `time without time zone`. */
export const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '—');

/** Prefer the stored minutes; fall back to the times when an older row lacks them. */
export function hoursFor(r: HRLeaveApprovalQueueRow): number | null {
  if (r.duration_minutes && r.duration_minutes > 0) return r.duration_minutes / 60;
  if (!r.start_time || !r.end_time) return null;
  const [sh, sm] = r.start_time.split(':').map(Number);
  const [eh, em] = r.end_time.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : null;
}

/**
 * Name over staff ID — the ID is what HR reconciles against.
 *
 * A real <button>, not a click handler on the row: the row already owns
 * selection and column resizing, so a row-level handler would fire on every
 * checkbox tick. This keeps the target keyboard-reachable and announced.
 */
function staffCell(r: HRLeaveApprovalQueueRow, onView: (row: HRLeaveApprovalQueueRow) => void) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onView(r); }}
      className="min-w-0 text-left"
      title={`View ${r.staff_name ?? 'request'} details`}
    >
      <span className="block truncate font-medium underline-offset-4 hover:underline">
        {r.staff_name ?? 'Unknown staff'}
      </span>
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {r.staff_code ?? 'no staff ID'}
      </span>
    </button>
  );
}

/**
 * The bulk-approve checkbox column.
 *
 * DataTable does NOT inject one — enableRowSelection only turns the machinery
 * on and hands getColumns a deselection callback; the column itself has to come
 * from here. Setting the flag without this column is why the checkboxes did not
 * appear. Same shape as leave-type-columns.tsx, the module's other selectable
 * table.
 *
 * Rows the caller cannot decide are still selectable — the toolbar reports how
 * many of a selection it will skip, which is friendlier than a checkbox that
 * silently refuses to tick.
 */
const selectColumn: ColumnDef<HRLeaveApprovalQueueRow> = {
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

const staffColumn = (a: ApprovalColumnActions): ColumnDef<HRLeaveApprovalQueueRow> => ({
  accessorKey: 'staff_name',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Staff member" />,
  cell: ({ row }) => staffCell(row.original, a.onView),
  size: 220,
  minSize: 160,
  enableHiding: false,
});

const institutionColumn: ColumnDef<HRLeaveApprovalQueueRow> = {
  accessorKey: 'institution_name',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
  cell: ({ row }) => (
    <span className="text-muted-foreground">{row.original.institution_name ?? '—'}</span>
  ),
  size: 210,
  minSize: 140,
};

/** Who decided it, resolved by the RPC — profiles is unreadable client-side. */
const decidedByColumn: ColumnDef<HRLeaveApprovalQueueRow> = {
  accessorKey: 'final_approver_name',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Decided by" />,
  cell: ({ row }) => {
    const r = row.original;
    if (!r.final_approver_id) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="min-w-0">
        <span className="block truncate">{r.final_approver_name ?? 'Unknown'}</span>
        {r.final_decided_at && (
          <span className="block truncate text-xs text-muted-foreground">
            {new Date(r.final_decided_at).toLocaleDateString('en-GB')}
          </span>
        )}
      </div>
    );
  },
  size: 170,
  minSize: 130,
};

const statusColumn: ColumnDef<HRLeaveApprovalQueueRow> = {
  accessorKey: 'status',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
  cell: ({ row }) => (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={row.original.status} />
      {row.original.is_emergency && (
        <Badge variant="outline" className="border-red-300 text-red-700">Emergency</Badge>
      )}
      {/* Moved out of the actions cell — see the note at the top of this file. */}
      {row.original.is_own && (
        <Badge variant="outline" className="border-amber-300 text-amber-800">Yours</Badge>
      )}
      {/*
        Why the row cannot be approved yet. In the STATUS cell rather than the
        actions menu because it is a fact about the request, and an approver
        scanning 165 gated August rows needs it visible without opening each
        menu. The menu carries the same fact next to the disabled Approve.
      */}
      {row.original.biometric_gap_from !== null && (
        <Badge
          variant="outline"
          className="border-amber-400 text-amber-800 dark:text-amber-400"
          title={`Biometric attendance is not uploaded for ${formatBiometricGap(
            row.original.biometric_gap_from,
          )}. Approving now would not reach the attendance report, so the database refuses it. Import the month from HR > Attendance > Import, then approve.`}
        >
          Biometric pending
        </Badge>
      )}
    </div>
  ),
  size: 190,
  minSize: 130,
};

/** One 32px trigger. Fixed and unshrinkable so it can never clip again. */
const actionsColumn = (a: ApprovalColumnActions): ColumnDef<HRLeaveApprovalQueueRow> => ({
  id: 'actions',
  header: () => <div className="text-right">Actions</div>,
  cell: ({ row }) => (
    <div className="flex justify-end">
      <ApprovalRowActions row={row.original} handlers={a} />
    </div>
  ),
  size: 90,
  minSize: 90,
  enableSorting: false,
  enableHiding: false,
  enableResizing: false,
});

export function getLeaveApprovalColumns(
  a: ApprovalColumnActions
): ColumnDef<HRLeaveApprovalQueueRow>[] {
  return [
    selectColumn,
    staffColumn(a),
    institutionColumn,
    {
      accessorKey: 'leave_type_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Leave" />,
      cell: ({ row }) => row.original.leave_type_name ?? '—',
      size: 180,
      minSize: 120,
    },
    {
      accessorKey: 'start_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start Date" />,
      cell: ({ row }) => fmtDate(row.original.start_date),
      size: 130,
      minSize: 110,
    },
    {
      accessorKey: 'end_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="End Date" />,
      cell: ({ row }) => fmtDate(row.original.end_date),
      size: 130,
      minSize: 110,
    },
    {
      accessorKey: 'total_days',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Days" />,
      // numeric arrives from PostgREST as a string ("1.00"); formatDays takes both.
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDays(row.original.total_days)}</span>
      ),
      size: 120,
      minSize: 100,
    },
    {
      accessorKey: 'duration_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {LEAVE_DURATION_LABELS[row.original.duration_type] ?? row.original.duration_type}
        </span>
      ),
      size: 130,
      minSize: 110,
    },
    {
      accessorKey: 'reason',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
      // The cell itself is `truncate max-w-0`, so the column width does the
      // clipping; title= keeps the full text reachable on hover.
      cell: ({ row }) => <span title={row.original.reason}>{row.original.reason || '—'}</span>,
      size: 240,
      minSize: 140,
    },
    decidedByColumn,
    statusColumn,
    actionsColumn(a),
  ];
}

export function getShortTimeOffColumns(
  a: ApprovalColumnActions
): ColumnDef<HRLeaveApprovalQueueRow>[] {
  return [
    selectColumn,
    staffColumn(a),
    institutionColumn,
    {
      accessorKey: 'leave_type_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => row.original.leave_type_name ?? '—',
      size: 180,
      minSize: 120,
    },
    {
      accessorKey: 'start_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => fmtDate(row.original.start_date),
      size: 130,
      minSize: 110,
    },
    {
      accessorKey: 'start_time',
      header: ({ column }) => <DataTableColumnHeader column={column} title="From" />,
      cell: ({ row }) => <span className="tabular-nums">{fmtTime(row.original.start_time)}</span>,
      size: 100,
      minSize: 90,
    },
    {
      accessorKey: 'end_time',
      header: ({ column }) => <DataTableColumnHeader column={column} title="To" />,
      cell: ({ row }) => <span className="tabular-nums">{fmtTime(row.original.end_time)}</span>,
      size: 100,
      minSize: 90,
    },
    {
      id: 'hours',
      accessorFn: (r) => hoursFor(r) ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hours" />,
      cell: ({ row }) => {
        const h = hoursFor(row.original);
        return <span className="tabular-nums">{h === null ? '—' : formatHours(h)}</span>;
      },
      size: 110,
      minSize: 90,
    },
    {
      accessorKey: 'reason',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
      // The cell itself is `truncate max-w-0`, so the column width does the
      // clipping; title= keeps the full text reachable on hover.
      cell: ({ row }) => <span title={row.original.reason}>{row.original.reason || '—'}</span>,
      size: 240,
      minSize: 140,
    },
    decidedByColumn,
    statusColumn,
    actionsColumn(a),
  ];
}
