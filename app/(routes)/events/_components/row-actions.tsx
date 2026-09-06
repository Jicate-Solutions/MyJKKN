'use client';

// Events Hub — per-row actions for the all-events DataTable.
//
// Edit + Change Status are offered ONLY for general events (`canManageHere`)
// AND only to the event's owner (`canEdit`). Specialised types keep their own
// console: a tournament's status runs through TournamentEventService and a
// marathon's through its own dashboard, both with their own transition
// allow-lists. Writing status from here would bypass them — front-end-only
// status changes that miss the server-side allow-list are a known recurring bug
// class in this repo.
//
// Ownership: whoever created the event edits it, everyone else reads it, super
// admins do anything. Both levers below are gated because both are an UPDATE on
// `events` — offering Change Status to a non-owner would just produce a denied
// write. canEditEvent() mirrors the events_auth_update policy; the DB is still
// the authority.
//
// Delete IS offered on every type, because the hub is the one place that answers
// "what events exist?" and none of the specialised consoles implement a delete
// of their own. It is gated on the `events.delete` catalog key via
// canAccess('events', 'delete') — a key held by no role until Role Management
// grants it, so by default only super admins see the item at all.
//
// The guard that matters is NOT this menu. `events` is a hub with 46 foreign
// keys pointing at it, 43 of them ON DELETE CASCADE — registrations, payment
// transactions, tournament matches, marathon results. The database refuses the
// delete (trg_events_block_delete_with_dependents) when registrations or
// payments exist; fn_event_delete_blockers reports those counts so this dialog
// can say so before the user commits rather than after.

import { useState } from 'react';
import type { Event, EventStatus } from '@/types/events';
import { MoreHorizontal, Eye, Edit, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';

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
import { GENERAL_EVENT_STATUS_TRANSITIONS, generalEventStatusLabel } from '@/types/events';
import { getErrorMessage } from '@/lib/utils';
import { canEditEvent, deleteBlockerSummary, type EventEditViewer } from './event-display';

interface EventsRowActionsProps {
  event: Event;
  /** False for marathon / tournament / induction — they manage themselves. */
  canManageHere: boolean;
  /** Resolved once by the table and passed down, not read per row. */
  viewer: EventEditViewer;
  onOpen: (event: Event) => void;
  onEdit: (event: Event) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
  onDelete: (id: string) => void;
  /** True while THIS row's delete mutation is in flight. */
  isDeleting: boolean;
}

export function EventsRowActions({
  event,
  canManageHere,
  viewer,
  onOpen,
  onEdit,
  onStatusChange,
  onDelete,
  isDeleting,
}: EventsRowActionsProps) {
  const { canAccess } = usePermissions();
  const canDelete = canAccess('events', 'delete');

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Only fetches while the dialog is open — one RPC per delete attempt rather
  // than one per rendered row.
  const {
    data: blockers,
    isLoading: checking,
    error: checkError,
  } = useEventDeleteBlockers(event.id, confirmOpen);

  const canEdit = canEditEvent(event, viewer);

  const transitions =
    canManageHere && canEdit
      ? (GENERAL_EVENT_STATUS_TRANSITIONS[event.status] ?? [])
      : [];

  // Default to "not yet" until the check says otherwise: while the counts are
  // unknown, the safe answer to "may I destroy this?" is no. Rendered as a
  // disabled button rather than a hidden one while `checking`, so the dialog's
  // footer doesn't reflow under the cursor the moment the RPC lands.
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
        <DropdownMenuContent align="end" className="w-[170px]">
          <DropdownMenuItem onClick={() => onOpen(event)}>
            <Eye className="mr-2 h-4 w-4" />
            {canManageHere ? 'Manage' : 'Open console'}
          </DropdownMenuItem>

          {canManageHere && canEdit && (
            <DropdownMenuItem onClick={() => onEdit(event)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}

          {transitions.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <RefreshCw className="mr-2 h-4 w-4" />
                Change Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {transitions.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onStatusChange(event.id, s)}>
                    → {generalEventStatusLabel(s)}
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
              {blockers?.blocked ? 'This event cannot be deleted' : 'Delete this event?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-medium text-foreground">{event.name}</span>
                </p>

                {checking && <p>Checking what this would remove…</p>}

                {checkError && (
                  <p className="text-destructive">{getErrorMessage(checkError)}</p>
                )}

                {blockers?.blocked && (
                  <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">{deleteBlockerSummary(blockers)}</p>
                      <p>
                        Deleting the event would destroy those permanently, with nothing
                        to restore from. Remove or refund them first, or move the event to
                        Draft to take it out of circulation.
                      </p>
                    </div>
                  </div>
                )}

                {blockers && !blockers.blocked && (
                  <p>
                    Nothing is registered against this event, so it can be removed
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
                  onDelete(event.id);
                  setConfirmOpen(false);
                }}
                disabled={!canProceed || isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {checking ? 'Checking…' : isDeleting ? 'Deleting…' : 'Delete event'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
