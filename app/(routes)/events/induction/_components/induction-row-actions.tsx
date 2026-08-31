'use client';

// Induction list — per-row actions.
//
// THREE DIFFERENT GATES, on purpose, because the three actions are three
// different writes and the database judges each one separately:
//
//   View / Senior Peer Mentors — ungated here. Getting into the module already
//     required induction.view OR being an appointed coordinator (see the
//     module layout's fallbackCheck), and both destinations run their own
//     server-side gate. A row you can see is a row you can open.
//
//   Edit — canEditEvent(), which mirrors events_auth_update clause for clause:
//     super admin, OR created_by = me, OR (created_by IS NULL AND my
//     institution). Every induction in production has created_by set, so in
//     practice this is "the person who created it, plus super admins".
//     Deliberately NOT widened to coordinators: an appointed coordinator runs
//     the programme (sessions, attendance, batches) through the DEFINER RPCs,
//     which is a different authority from UPDATE on the events row. Offering
//     them an Edit item would produce a write RLS refuses — and an RLS-denied
//     UPDATE is not an error, it silently affects 0 rows.
//
//   Change Status — the SAME gate as Edit, because it is the same write: an
//     UPDATE on the events row under events_auth_update. Added 2026-08-18
//     because the module had no status writer at all — fn_induction_create_program
//     hardcodes 'draft' and nothing ever wrote another value, so every induction
//     was stuck in Draft and the detail console could only render the badge.
//     Transitions come from INDUCTION_STATUS_TRANSITIONS and are re-validated
//     server-side by InductionEventService; this menu only decides what to OFFER.
//
//   Delete — the `events.delete` catalog key, held by NO role until Role
//     Management grants it, so by default only super admins see the item.
//
// THE GUARD THAT MATTERS IS NOT THIS MENU. Thirteen induction_* tables cascade
// off `events`, and an induction never writes events_registrations — freshers
// arrive through fn_induction_auto_enroll. Until 2026-08-18 the delete guard
// counted only registrations and payments, so every induction reported "safe to
// delete" while holding hundreds of learners. fn_event_delete_blockers now
// counts induction_enrollment as well, and
// trg_events_block_delete_with_dependents refuses the delete in the database —
// which is where it has to be, since /rest/v1/events never opens a dialog.

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Edit,
  Eye,
  MessagesSquare,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { usePermissions } from '@/hooks/use-permissions';
import { useEventDeleteBlockers } from '@/hooks/events/use-general-events';
import { getErrorMessage } from '@/lib/utils';
import { INDUCTION_STATUS_TRANSITIONS, inductionStatusLabel } from '@/types/events';
import type { EventStatus } from '@/types/events';
import type { InductionListRow } from '@/lib/services/induction/induction-service';
import {
  canEditEvent,
  deleteBlockerSummary,
  type EventEditViewer,
} from '../../_components/event-display';

interface InductionRowActionsProps {
  induction: InductionListRow;
  /** Resolved once by the table and passed down, not read per row. */
  viewer: EventEditViewer;
  onEdit: (induction: InductionListRow) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
  onDelete: (id: string) => void;
  /** True while THIS row's delete mutation is in flight. */
  isDeleting: boolean;
  /** True while THIS row's status mutation is in flight. */
  isUpdatingStatus: boolean;
}

export function InductionRowActions({
  induction,
  viewer,
  onEdit,
  onStatusChange,
  onDelete,
  isDeleting,
  isUpdatingStatus,
}: InductionRowActionsProps) {
  const { canAccess } = usePermissions();
  const canDelete = canAccess('events', 'delete');
  // canEditEvent only needs ownership (created_by + institution_id), which the
  // list row carries — no full Event, and no cast.
  const canEdit = canEditEvent(induction, viewer);

  // Status is an UPDATE on the same `events` row as Edit, under the same
  // events_auth_update policy — so it rides the same gate. Offering it more
  // widely would just produce a write the database throws on.
  const transitions = canEdit
    ? (INDUCTION_STATUS_TRANSITIONS[(induction.status ?? 'draft') as EventStatus] ?? [])
    : [];

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Only fetches while the dialog is open — one RPC per delete attempt rather
  // than one per rendered row.
  const {
    data: blockers,
    isLoading: checking,
    error: checkError,
  } = useEventDeleteBlockers(induction.id, confirmOpen);

  // Default to "not yet" until the check says otherwise: while the counts are
  // unknown, the safe answer to "may I destroy this?" is no.
  const canProceed = !!blockers && !blockers.blocked && !checkError;
  const showAction = checking || canProceed;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[210px]">
          <DropdownMenuItem asChild>
            <Link href={`/events/induction/${induction.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              View induction
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href={`/events/induction/${induction.id}/mentors`}>
              <MessagesSquare className="mr-2 h-4 w-4" />
              Senior Peer Mentors
            </Link>
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem onClick={() => onEdit(induction)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}

          {transitions.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isUpdatingStatus}>
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isUpdatingStatus ? 'animate-spin' : ''}`}
                />
                Change Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {transitions.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onStatusChange(induction.id, s)}>
                    → {inductionStatusLabel(s)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockers?.blocked
                ? 'This induction cannot be deleted'
                : 'Delete this induction?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-medium text-foreground">{induction.name}</span>
                </p>

                {checking && <p>Checking what this would remove…</p>}

                {checkError && <p className="text-destructive">{getErrorMessage(checkError)}</p>}

                {blockers?.blocked && (
                  <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">{deleteBlockerSummary(blockers)}</p>
                      <p>
                        Deleting the induction would destroy those permanently —
                        along with their batches, attendance, feedback and
                        completion records — with nothing to restore from. Move it
                        to Draft to take it out of circulation instead.
                      </p>
                    </div>
                  </div>
                )}

                {blockers && !blockers.blocked && (
                  <p>
                    Nobody is enrolled in this induction, so it can be removed
                    cleanly. This cannot be undone.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{canProceed ? 'Cancel' : 'Close'}</AlertDialogCancel>
            {showAction && (
              <AlertDialogAction
                onClick={(e) => {
                  // Belt and braces: AlertDialogAction closes the dialog on
                  // click, so a disabled-looking button that still fired would
                  // delete on a stale check. Guard the handler too.
                  if (!canProceed) {
                    e.preventDefault();
                    return;
                  }
                  onDelete(induction.id);
                  setConfirmOpen(false);
                }}
                disabled={!canProceed || isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {checking ? 'Checking…' : isDeleting ? 'Deleting…' : 'Delete induction'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
