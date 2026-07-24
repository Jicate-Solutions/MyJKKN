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
import { MoreHorizontal, Pencil, Archive, Users, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import type { HRLeaveType } from '@/types/hr-leave-types';

interface LeaveTypeRowActionsProps {
  leaveType: HRLeaveType;
  /** Same modal the Leave Type cell opens — duplicated here for discoverability. */
  onView: (t: HRLeaveType) => void;
  onAssign: (t: HRLeaveType) => void;
  onEdit: (t: HRLeaveType) => void;
  onArchive: (t: HRLeaveType) => Promise<void> | void;
}

export function LeaveTypeRowActions({
  leaveType,
  onView,
  onAssign,
  onEdit,
  onArchive,
}: LeaveTypeRowActionsProps) {
  const [showArchiveAlert, setShowArchiveAlert] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      // The page handler owns the toast and the refresh bump; it swallows its
      // own errors, so there is nothing to catch here.
      await Promise.resolve(onArchive(leaveType));
    } finally {
      setIsArchiving(false);
      setShowArchiveAlert(false);
    }
  };

  return (
    <>
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
          <DropdownMenuItem onClick={() => onEdit(leaveType)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {leaveType.is_active && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowArchiveAlert(true)}
                className="text-destructive"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showArchiveAlert} onOpenChange={setShowArchiveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this leave type?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{leaveType.leave_type_name}</strong> will stop being offered
              when staff apply for leave. Existing applications and balances are not
              affected. This screen has no un-archive action, so reversing it needs a
              database change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog mounted while the mutation runs — the default
                // action closes it immediately, unmounting the pending state.
                e.preventDefault();
                void handleArchive();
              }}
              disabled={isArchiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isArchiving ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
