'use client';

// Three-dot row menu for the HR Leave Types table (2026-07-23).
//
// Replaces three always-visible icon buttons. Same pattern as the BoS list
// tables (bos/member-types/_components/row-actions.tsx): MoreHorizontal
// trigger, destructive item last and separated, confirmation for the
// destructive one.
//
// The mutation itself stays on the page — it already owns the toast and the
// table's refresh token. This component owns only the menu and the confirm.

import { useState } from 'react';
import {
  MoreHorizontal, Pencil, Archive, Users, Eye, GitBranch,
  ArchiveRestore, Trash2, Loader2, AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { HRLeaveType } from '@/types/hr-leave-types';
import type { HRLeaveTypeDeleteResult } from '@/lib/services/hr/leave-type-service';

interface LeaveTypeRowActionsProps {
  leaveType: HRLeaveType;
  /** Same modal the Leave Type cell opens — duplicated here for discoverability. */
  onView: (t: HRLeaveType) => void;
  onAssign: (t: HRLeaveType) => void;
  onEdit: (t: HRLeaveType) => void;
  /** Opens the approval-chain editor for this type. */
  onApprovalFlow: (t: HRLeaveType) => void;
  /** ASKS THE PAGE to open its archive confirmation. Does not archive. */
  onArchive: (t: HRLeaveType) => void;
  /** Un-archive. Shown only on an archived row. */
  onActivate: (t: HRLeaveType) => Promise<void> | void;
  /** ASKS THE PAGE to open its delete confirmation. Does not delete. */
  onDelete: (t: HRLeaveType) => void;
}

export function LeaveTypeRowActions({
  leaveType,
  onView,
  onAssign,
  onEdit,
  onApprovalFlow,
  onArchive,
  onActivate,
  onDelete,
}: LeaveTypeRowActionsProps) {
  const [isActivating, setIsActivating] = useState(false);
  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await Promise.resolve(onActivate(leaveType));
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            aria-label={`Actions for ${leaveType.leave_type_name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuItem onClick={() => onView(leaveType)}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAssign(leaveType)}>
            <Users className="mr-2 h-4 w-4" />
            Who gets this
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onApprovalFlow(leaveType)}>
            <GitBranch className="mr-2 h-4 w-4" />
            Who approves this
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(leaveType)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {leaveType.is_active ? (
            <DropdownMenuItem
              // Deferred by one tick: Radix closes the menu on select and
              // returns focus to its trigger, and a dialog opened in that same
              // frame sees focus land outside itself and dismisses.
              onClick={() => setTimeout(() => onArchive(leaveType), 0)}
              className="text-destructive"
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          ) : (
            <>
              {/* Activate needs no confirmation: it is the exact inverse of
                  Archive, destroys nothing, and is itself undoable. */}
              <DropdownMenuItem onClick={() => void handleActivate()} disabled={isActivating}>
                {isActivating
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <ArchiveRestore className="mr-2 h-4 w-4" />}
                Activate
              </DropdownMenuItem>
              {/* Delete is offered ONLY on an archived row, so removing a type
                  is always archive-then-delete and never one click from the
                  list staff are applying against. */}
              <DropdownMenuItem
                // Deferred for the same reason as Archive above.
                onClick={() => setTimeout(() => onDelete(leaveType), 0)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
    </DropdownMenu>
  );
}
