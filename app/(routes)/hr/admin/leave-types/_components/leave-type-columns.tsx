'use client';

// Column definitions for the HR Leave Types advanced DataTable.
// Split out of page.tsx (2026-07-23) when the card grid became a table — the
// grid could not express sorting, column visibility, selection or export, and
// an org with 20+ types was unreadable as cards.

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import {
  APPLICABLE_GENDER_LABELS,
  REQUEST_CATEGORY_LABELS,
  type HRLeaveType,
} from '@/types/hr-leave-types';
import { LeaveTypeRowActions } from './leave-type-row-actions';
import type { LeaveApprovalFlowCoverage } from '@/lib/services/hr/leave-approval-flow-service';

export interface LeaveTypeColumnActions {
  canManage: boolean;
  /** Opens the read-only detail modal. Wired to the Leave Type cell itself. */
  onView: (t: HRLeaveType) => void;
  onAssign: (t: HRLeaveType) => void;
  onEdit: (t: HRLeaveType) => void;
  /** Opens the approval-chain editor for this type. */
  onApprovalFlow: (t: HRLeaveType) => void;
  /** Asks the page to open its archive confirmation. */
  onArchive: (t: HRLeaveType) => void;
  onActivate: (t: HRLeaveType) => Promise<void> | void;
  /** Asks the page to open its delete confirmation. */
  onDelete: (t: HRLeaveType) => void;
  /**
   * hr_organization_id → institution name, from useHrOrgMappings.
   *
   * Passed in rather than resolved per cell: a cell-level hook would open one
   * subscription per visible row for a single shared query. Empty until the
   * mapping RPC resolves, which is why the cell falls back to '—'.
   */
  orgNameById: Map<string, string>;
  /**
   * Which types have their own approval flow and which organizations have a
   * catch-all. Passed in for the same reason as orgNameById — one shared query,
   * not one subscription per visible row. Undefined until it resolves.
   */
  flowCoverage: LeaveApprovalFlowCoverage | undefined;
}

/** Paid / Carry-forward / Encashable, rendered as one wrapping badge cluster. */
function FlagBadges({ t }: { t: HRLeaveType }) {
  const flags: string[] = [];
  if (t.is_paid) flags.push('Paid');
  if (t.allow_carry_forward) flags.push('Carry-forward');
  if (t.is_encashable) flags.push('Encashable');
  if (t.requires_approval) flags.push('Approval');
  if (t.requires_documents) flags.push('Documents');

  if (flags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Badge key={f} variant="outline" className="font-normal">
          {f}
        </Badge>
      ))}
    </div>
  );
}

export function getLeaveTypeColumns(
  actions: LeaveTypeColumnActions
): ColumnDef<HRLeaveType>[] {
  const columns: ColumnDef<HRLeaveType>[] = [
    {
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
    },
    {
      accessorKey: 'leave_type_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Leave Type" />
      ),
      size: 240,
      cell: ({ row }) => {
        const t = row.original;
        return (
          // A real <button>, not a click handler on the row: the row also owns
          // selection and column resizing, and this keeps the target keyboard
          // reachable and announced. stopPropagation so opening the modal never
          // toggles the row's checkbox.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.onView(t);
            }}
            className="flex w-full hover:underline hover:text-primary items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`View ${t.leave_type_name} details`}
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full border"
              style={{ background: t.color_code }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block truncate font-medium underline-offset-4 hover:underline">
                {t.leave_type_name}
              </span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {t.leave_type_code}
              </span>
            </span>
          </button>
        );
      },
    },
    {
      // Leave types key on hr_organization_id, not institution_id. The two are
      // 1:1 and hr_organizations.name mirrors institutions.name, so the mapping
      // hook's name is the institution label — no extra join needed.
      accessorKey: 'hr_organization_id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Institution" />
      ),
      size: 240,
      cell: ({ row }) => {
        const name = actions.orgNameById.get(row.original.hr_organization_id);
        return name ? (
          <span className="block truncate text-sm" title={name}>
            {name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
      // No sortingFn here on purpose: the DataTable runs manualSorting, so a
      // column-level comparator is never called. Sorting this column by its
      // resolved NAME instead of its raw uuid is handled in the wrapper's
      // fetchDataFn — see leave-types-data-table.tsx.
    },
    {
      accessorKey: 'request_category',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      size: 150,
      cell: ({ row }) => {
        const c = row.original.request_category;
        return <Badge variant="secondary">{REQUEST_CATEGORY_LABELS[c] ?? c}</Badge>;
      },
    },
    {
      id: 'approval',
      header: 'Approval',
      size: 130,
      // Derived from two Sets rather than a row field, so there is nothing to
      // sort or filter on server-side.
      enableSorting: false,
      cell: ({ row }) => {
        const t = row.original;
        const cov = actions.flowCoverage;
        if (!cov) return <span className="text-muted-foreground">—</span>;

        // A type with its OWN flow. The only state the row menu's "Who approves
        // this" has actually been used for.
        if (cov.ownFlowTypeIds.has(t.id)) {
          return (
            <Badge
              variant="secondary"
              title="This leave type has its own approval flow, which beats the organisation's catch-all."
            >
              Own flow
            </Badge>
          );
        }

        // Inheriting the organisation's catch-all is NOT a misconfiguration —
        // 58 of 66 active types do exactly this. Rendered quietly so it does
        // not read as something to fix.
        if (cov.orgsWithCatchAll.has(t.hr_organization_id)) {
          return (
            <span
              className="text-xs text-muted-foreground"
              title="No flow of its own, so it follows the organisation's catch-all flow. Use “Who approves this” to give it a specific one."
            >
              Org default
            </span>
          );
        }

        // Nothing resolves. buildApprovalChain THROWS in this state, so nobody
        // can apply for this leave type at all — the one case worth shouting
        // about, and the reason this column exists.
        return (
          <Badge
            variant="destructive"
            title="No approval flow resolves for this leave type, so applying for it fails outright. Use “Who approves this” on the row menu, or give the organisation a catch-all flow."
          >
            Not set
          </Badge>
        );
      },
    },
    {
      accessorKey: 'duration_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Duration" />
      ),
      size: 140,
      cell: ({ row }) => {
        const d = row.original.duration_type;
        return <span className="text-sm">{LEAVE_DURATION_LABELS[d] ?? d}</span>;
      },
    },
    {
      accessorKey: 'applicable_gender',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Applies To" />
      ),
      size: 130,
      cell: ({ row }) => {
        const g = row.original.applicable_gender;
        return (
          <span className="text-sm text-muted-foreground">
            {APPLICABLE_GENDER_LABELS[g] ?? g}
          </span>
        );
      },
    },
    {
      id: 'flags',
      header: 'Rules',
      size: 260,
      enableSorting: false,
      cell: ({ row }) => <FlagBadges t={row.original} />,
    },
    
    {
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      size: 100,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="default">Active</Badge>
        ) : (
          <Badge variant="secondary">Archived</Badge>
        ),
    }
  ];

  if (!actions.canManage) return columns;

  return [
    ...columns,
    {
      id: 'actions',
      header: 'Actions',
      size: 60,
      minSize: 60,
      maxSize: 80,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <LeaveTypeRowActions
          leaveType={row.original}
          onView={actions.onView}
          onAssign={actions.onAssign}
          onEdit={actions.onEdit}
          onApprovalFlow={actions.onApprovalFlow}
          onArchive={actions.onArchive}
          onActivate={actions.onActivate}
          onDelete={actions.onDelete}
        />
      ),
    },
  ];
}
