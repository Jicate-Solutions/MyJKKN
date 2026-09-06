'use client';

// Three-dot row menu for the HR Leave Approvals tables (2026-08-20).
//
// Replaces a pair of always-visible Approve / Reject buttons. Same pattern as
// leave-type-row-actions.tsx: MoreHorizontal trigger, destructive item last and
// separated. It also removes a whole class of bug — those two buttons needed
// ~200px in a cell the DataTable renders as `truncate max-w-0`, so at the
// default 150px column width the overflow was clipped off the left edge and
// Approve simply vanished, leaving Reject looking like the only choice. A
// 32px trigger cannot outgrow its cell, and Radix portals the menu to the body
// so the panel itself is never clipped either.
//
// The mutations stay on the page — it owns the error alert, the reject-reason
// dialog, the detail sheet and the React Query invalidation. This component
// owns only the menu.

import { Check, Eye, MoreHorizontal, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';
import { formatBiometricGap } from './format';

export interface ApprovalRowActionHandlers {
  /** Opens the detail SHEET. No navigation — see approval-detail-sheet.tsx. */
  onView: (row: HRLeaveApprovalQueueRow) => void;
  onApprove: (row: HRLeaveApprovalQueueRow) => void;
  onReject: (row: HRLeaveApprovalQueueRow) => void;
  /** True while any decision is in flight — disables every menu at once. */
  isPending: boolean;
}

export function ApprovalRowActions({
  row,
  handlers,
}: {
  row: HRLeaveApprovalQueueRow;
  handlers: ApprovalRowActionHandlers;
}) {
  const who = row.staff_name ?? 'this request';
  // The queue carries decided history too. can_decide is already false on those
  // rows, but they must not fall into the "your own request" explanation below
  // — a decided row is undecidable for everyone, not just its owner.
  const isDecided = row.status !== 'pending' && row.status !== 'escalated';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          aria-label={`Actions for ${who}`}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[210px]">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {who}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Opens a sheet over the table rather than navigating to
            /hr/leave/[id]. A redirect would lose the queue's page, sort and
            filters, which this table holds in memory and not in the URL. */}
        <DropdownMenuItem onClick={() => handlers.onView(row)}>
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>

        {/*
          Gated on can_decide, never on is_own. A super admin's own request is
          BOTH — hr_trig_leave_enforce_approver exempts super admins from the
          self-approval bar, so hiding these on is_own would block exactly the
          person the database lets through.
        */}
        {isDecided ? null : row.can_decide ? (
          <>
            <DropdownMenuSeparator />
            {/*
              Approve is disabled — never hidden — while the biometric for a
              covered day is missing, and the reason sits directly under it.
              Hiding it would read as "you may not decide this", which is a
              different and wrong explanation: the approver has every right,
              the day just is not importable yet.

              REJECT STAYS ENABLED. The gate exists because approving writes an
              attendance stamp that would go nowhere; rejecting writes no stamp
              and the database does not refuse it. Blocking both would strand a
              request that ought to be refusable on its own merits.
            */}
            <DropdownMenuItem
              disabled={handlers.isPending || row.biometric_gap_from !== null}
              onClick={() => handlers.onApprove(row)}
              className="text-emerald-700 focus:text-emerald-700"
            >
              <Check className="mr-2 h-4 w-4" />
              Approve
            </DropdownMenuItem>
            {row.biometric_gap_from !== null && (
              <DropdownMenuLabel className="whitespace-normal py-1 text-xs font-normal leading-snug text-amber-700 dark:text-amber-400">
                Biometric not uploaded for{' '}
                {formatBiometricGap(row.biometric_gap_from)} — import it first,
                or the approval will not reach the attendance report.
              </DropdownMenuLabel>
            )}
            <DropdownMenuItem
              disabled={handlers.isPending}
              onClick={() => handlers.onReject(row)}
              className="text-destructive focus:text-destructive"
            >
              <X className="mr-2 h-4 w-4" />
              Reject…
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            {/* Explain the absence rather than showing an item that would come
                back as a policy denial after the click. */}
            <DropdownMenuItem disabled>Your own request — cannot decide</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
