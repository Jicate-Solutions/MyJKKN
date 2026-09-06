'use client';

// Sports Tournaments — per-row actions (View / Edit / Delete).
// Caller passes the already-resolved permission flags so the gate lives in one
// place (tournaments-data-table.tsx) and this stays a dumb renderer.

import { useState } from 'react';
import type { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Edit, Trash, RefreshCw } from 'lucide-react';

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
import type { Event, EventStatus } from '@/types/events';
import { TOURNAMENT_STATUS_TRANSITIONS, tournamentStatusLabel } from '@/types/tournament';
import { useDeleteTournament } from '@/hooks/events/use-tournaments';

interface DataTableRowActionsProps {
  row: Row<Event>;
  canEdit: boolean;
  canDelete: boolean;
  onView: (event: Event) => void;
  onEdit: (event: Event) => void;
  /** Bumps the table's refetch key after a successful delete. */
  onDeleted: () => void;
  onStatusChange: (id: string, status: EventStatus) => void;
}

export function DataTableRowActions({
  row,
  canEdit,
  canDelete,
  onView,
  onEdit,
  onDeleted,
  onStatusChange,
}: DataTableRowActionsProps) {
  const tournament = row.original;
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const deleteTournament = useDeleteTournament();
  // Tournaments are Draft <-> Active only — never the shared 8-state lifecycle.
  const allowedTransitions = TOURNAMENT_STATUS_TRANSITIONS[tournament.status] ?? [];

  const handleDelete = () => {
    deleteTournament.mutate(tournament.id, {
      onSuccess: () => {
        setShowDeleteAlert(false);
        onDeleted();
      },
      onError: () => setShowDeleteAlert(false),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => onView(tournament)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem onClick={() => onEdit(tournament)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {canEdit && allowedTransitions.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <RefreshCw className="mr-2 h-4 w-4" />
                Change Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {allowedTransitions.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onStatusChange(tournament.id, s)}>
                    → {tournamentStatusLabel(s)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteAlert(true)}
                className="text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tournament?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{tournament.name}</strong> along with its
              divisions, entries and fixtures. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTournament.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteTournament.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTournament.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
