'use client';

// Sports Tournaments — advanced DataTable wrapper.
// Data comes from TournamentEventService.getTournaments() (client-side; RLS
// gates row visibility), so search/sort/pagination are applied client-side
// inside fetchDataFn. Action permission map:
//   create → sports.tournaments.create
//   edit   → sports.tournaments.edit   (also gates the inline status select)
//   delete → sports.tournaments.manage (catalog has no .delete key)

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, TrashIcon } from 'lucide-react';
import toast from 'react-hot-toast';

import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { logger } from '@/lib/utils/enhanced-logger';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdateTournamentStatus } from '@/hooks/events/use-tournaments';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import { TournamentEventService } from '@/lib/services/events/tournament/tournament-event-service';
import type { Event, EventStatus } from '@/types/events';
import { getColumns } from './columns';
import { EditTournamentDialog } from './edit-tournament-dialog';

export function TournamentsDataTable() {
  const router = useRouter();
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } =
    usePermissions();
  const updateStatus = useUpdateTournamentStatus();

  // Mutation hooks invalidate the ['tournaments', …] RQ keys; bridge those
  // invalidations into this fetchDataFn-mode table.
  const refetchKey = useDataTableRefreshOnInvalidate(['tournaments']);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  // Bulk delete state.
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<{
    rows: Event[];
    resetSelection: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreate = isSuperAdmin || canAccess('sports.tournaments', 'create');
  const canEdit = isSuperAdmin || canAccess('sports.tournaments', 'edit');
  const canDelete = isSuperAdmin || canAccess('sports.tournaments', 'manage');

  const handleView = useCallback(
    (event: Event) => router.push(`/events/tournament/${event.id}`),
    [router]
  );

  const handleEdit = useCallback((event: Event) => {
    setEditing(event);
    setEditOpen(true);
  }, []);

  const handleStatusChange = useCallback(
    (id: string, status: EventStatus) => updateStatus.mutate({ id, status }),
    [updateStatus]
  );

  const columns = useMemo(
    () =>
      getColumns({
        canEdit,
        canDelete,
        onView: handleView,
        onEdit: handleEdit,
        onDeleted: () => {}, // delete hook invalidates ['tournaments'] → refetchKey bumps
        onStatusChange: handleStatusChange,
      }),
    [canEdit, canDelete, handleView, handleEdit, handleStatusChange]
  );

  // Client-side search/sort/paginate over the RLS-scoped tournament list.
  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const all = await TournamentEventService.getTournaments();

      let rows = all;
      if (params.search) {
        const q = params.search.toLowerCase();
        rows = rows.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            (e.venue ?? '').toLowerCase().includes(q) ||
            (e.venue_text ?? '').toLowerCase().includes(q) ||
            (e.description ?? '').toLowerCase().includes(q)
        );
      }

      const sortBy = (params.sort_by || 'created_at') as keyof Event;
      const dir = params.sort_order === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        if (av == null && bv == null) return 0;
        if (av == null) return 1; // nulls last regardless of direction
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });

      const total = rows.length;
      const start = (params.page - 1) * params.limit;

      return {
        success: true,
        data: rows.slice(start, start + params.limit),
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / params.limit)),
          total_items: total,
        },
      };
    },
    []
  );

  // Bulk delete goes through the service directly (one toast, one invalidation)
  // instead of N useDeleteTournament calls that would each toast separately.
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const count = pendingDelete.rows.length;
    setIsDeleting(true);
    try {
      await Promise.all(
        pendingDelete.rows.map((row) => TournamentEventService.deleteTournament(row.id))
      );
      toast.success(`${count} tournament${count > 1 ? 's' : ''} deleted`);
      pendingDelete.resetSelection();
    } catch (error) {
      logger.error('events/tournament', 'Error bulk-deleting tournaments', error);
      toast.error('Failed to delete some tournaments');
    } finally {
      // Invalidation bumps refetchKey via useDataTableRefreshOnInvalidate.
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  const renderToolbar = (props: { selectedRows: Event[]; resetSelection: () => void }) => (
    <div className="flex items-center gap-2">
      {canCreate && (
        <Button size="sm" className="h-8" onClick={() => router.push('/events/tournament/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Tournament
        </Button>
      )}
      {canDelete && props.selectedRows.length > 0 && (
        <Button
          size="sm"
          variant="destructive"
          className="h-8"
          onClick={() =>
            setPendingDelete({ rows: props.selectedRows, resetSelection: props.resetSelection })
          }
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  if (permissionsLoading || !userProfile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as never}
        exportConfig={{
          entityName: 'sports-tournaments',
          columnMapping: {
            name: 'Tournament',
            start_date: 'Start Date',
            end_date: 'End Date',
            venue: 'Venue',
            scope: 'Scope',
            year: 'Year',
            status: 'Status',
          },
          columnWidths: [
            { wch: 36 },
            { wch: 14 },
            { wch: 14 },
            { wch: 28 },
            { wch: 12 },
            { wch: 8 },
            { wch: 12 },
          ],
          headers: ['name', 'start_date', 'end_date', 'venue', 'scope', 'year', 'status'],
        }}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'sports-tournaments-table',
        }}
        renderToolbarContent={renderToolbar}
        refetchKey={refetchKey}
      />

      <EditTournamentDialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        tournament={editing}
        onSaved={() => {}} // update hook invalidates ['tournaments'] → refetchKey bumps
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournaments</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.rows.length ?? 0} tournament
              {(pendingDelete?.rows.length ?? 0) > 1 ? 's' : ''}? This also removes their
              divisions, entries and fixtures. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
