'use client';

// Events Hub — per-row actions for the all-events DataTable.
//
// Edit + Change Status are offered ONLY for general events (`canManageHere`).
// Specialised types keep their own console: a tournament's status runs through
// TournamentEventService and a marathon's through its own dashboard, both with
// their own transition allow-lists. Writing status from here would bypass them
// — front-end-only status changes that miss the server-side allow-list are a
// known recurring bug class in this repo.
//
// No delete: the events permission catalog has no `events.delete` key, and the
// card list this replaces never offered one either.

import type { Event, EventStatus } from '@/types/events';
import { MoreHorizontal, Eye, Edit, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GENERAL_EVENT_STATUS_TRANSITIONS, generalEventStatusLabel } from '@/types/events';

interface EventsRowActionsProps {
  event: Event;
  /** False for marathon / tournament / induction — they manage themselves. */
  canManageHere: boolean;
  onOpen: (event: Event) => void;
  onEdit: (event: Event) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
}

export function EventsRowActions({
  event,
  canManageHere,
  onOpen,
  onEdit,
  onStatusChange,
}: EventsRowActionsProps) {
  const transitions = canManageHere
    ? (GENERAL_EVENT_STATUS_TRANSITIONS[event.status] ?? [])
    : [];

  return (
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

        {canManageHere && (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
