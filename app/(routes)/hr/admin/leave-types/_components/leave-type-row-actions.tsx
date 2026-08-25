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
import type { HRLeaveTypeDeleteResult } from '@/lib/services/hr/leave-type-service';

interface LeaveTypeRowActionsProps {
  leaveType: HRLeaveType;
  /** Same modal the Leave Type cell opens — duplicated here for discoverability. */
  onView: (t: HRLeaveType) => void;
  onAssign: (t: HRLeaveType) => void;
  onEdit: (t: HRLeaveType) => void;
  /** Opens the approval-chain editor for this type. */
  onApprovalFlow: (t: HRLeaveType) => void;
  onArchive: (t: HRLeaveType) => Promise<void> | void;
  /** Un-archive. Shown only on an archived row. */
  onActivate: (t: HRLeaveType) => Promise<void> | void;
  /**
   * Asks the server what a delete WOULD do, writing nothing. Its verdict is
   * what the dialog renders — the counts are not computed on the client,
   * because the client cannot see which of the nine FKs cascade.
   */
  onCheckDelete: (t: HRLeaveType) => Promise<HRLeaveTypeDeleteResult>;
  /** Commits the delete. The server re-runs every check first. */
  onDelete: (t: HRLeaveType) => Promise<void> | void;
}

/** Blocker key -> how to say it in a sentence about leave. */
const BLOCKER_LABELS: Record<string, [singular: string, plural: string]> = {
  applications: ['leave application', 'leave applications'],
  encashments: ['encashment', 'encashments'],
  consumed_balances: ['balance with leave taken', 'balances with leave taken'],
  overrides: ['per-staff entitlement override', 'per-staff entitlement overrides'],
  adjustments: ['balance adjustment', 'balance adjustments'],
  superseding_types: ['leave type superseded by it', 'leave types superseded by it'],
};

export function LeaveTypeRowActions({
  leaveType,
  onView,
  onAssign,
  onEdit,
  onApprovalFlow,
  onArchive,
  onActivate,
  onCheckDelete,
  onDelete,
}: LeaveTypeRowActionsProps) {
  const [showArchiveAlert, setShowArchiveAlert] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // null while the dry run is in flight — the dialog must not offer a Delete
  // button before the server has said whether it is allowed.
  const [impact, setImpact] = useState<HRLeaveTypeDeleteResult | null>(null);

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

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await Promise.resolve(onActivate(leaveType));
    } finally {
      setIsActivating(false);
    }
  };

  const openDelete = async () => {
    setImpact(null);
    setShowDeleteAlert(true);
    try {
      setImpact(await onCheckDelete(leaveType));
    } catch {
      // The page toasts the error. Leaving impact null keeps the dialog in its
      // "checking" state with no Delete button, which is the safe resting
      // place for a destructive dialog that could not verify anything.
      setImpact({ ok: false, error: 'check_failed' });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.resolve(onDelete(leaveType));
    } finally {
      setIsDeleting(false);
      setShowDeleteAlert(false);
    }
  };

  const blockers = Object.entries(impact?.blockers ?? {}).filter(([, n]) => n > 0);
  const canDelete = impact?.ok === true && blockers.length === 0;

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
              onClick={() => setShowArchiveAlert(true)}
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
                onClick={() => void openDelete()}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete permanently
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
              affected, and you can put it back with <strong>Activate</strong> on the
              same menu.
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

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {leaveType.leave_type_name} permanently?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {impact === null && (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking what depends on this leave type…
                  </span>
                )}

                {/* Refused. The server names every reason, so the admin knows
                    what to look at instead of being told "cannot delete". */}
                {impact && !canDelete && (
                  <>
                    <span className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {blockers.length > 0
                          ? 'This leave type has history attached, so it cannot be deleted. It stays archived, which already hides it from staff.'
                          : impact.message ?? 'This leave type cannot be deleted right now.'}
                      </span>
                    </span>
                    {blockers.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-5">
                        {blockers.map(([key, n]) => {
                          const [one, many] = BLOCKER_LABELS[key] ?? [key, key];
                          return (
                            <li key={key}>
                              <strong>{n}</strong> {n === 1 ? one : many}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}

                {/* Allowed. Say what goes, in the operator's units. */}
                {canDelete && (
                  <>
                    <span>
                      Nothing depends on this leave type, so it can be removed for good.
                      This cannot be undone.
                    </span>
                    {impact?.will_remove && (
                      <ul className="list-disc space-y-0.5 pl-5">
                        <li>
                          <strong>{impact.will_remove.placeholder_balances}</strong> unused
                          balance row
                          {impact.will_remove.placeholder_balances === 1 ? '' : 's'} — generated
                          allowances nobody drew on
                        </li>
                        {impact.will_remove.assignments > 0 && (
                          <li>
                            <strong>{impact.will_remove.assignments}</strong> “who gets this”
                            assignment{impact.will_remove.assignments === 1 ? '' : 's'}
                          </li>
                        )}
                        {impact.will_remove.cadre_entitlements > 0 && (
                          <li>
                            <strong>{impact.will_remove.cadre_entitlements}</strong> cadre
                            entitlement{impact.will_remove.cadre_entitlements === 1 ? '' : 's'}
                          </li>
                        )}
                        {impact.will_remove.policies > 0 && (
                          <li>
                            <strong>{impact.will_remove.policies}</strong> leave polic
                            {impact.will_remove.policies === 1 ? 'y' : 'ies'}
                          </li>
                        )}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {canDelete ? 'Cancel' : 'Close'}
            </AlertDialogCancel>
            {/* No button at all until the server has cleared it — a disabled
                Delete on a refused dialog just invites clicking. */}
            {canDelete && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Deleting…' : 'Delete permanently'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
