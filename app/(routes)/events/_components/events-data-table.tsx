'use client';

// Events Hub — the all-events advanced DataTable.
//
// Scope: EVERY `events` row the caller's RLS lets them see, not just the
// general ones. useGeneralEvents deliberately excludes the three types with a
// dedicated console; this table includes them behind a Type column + filter so
// the hub answers "what events exist?" in one place. Rows still open in the
// right console (see consoleHrefFor).
//
// Data comes straight from EventBaseService.getEvents({}) — the same
// client-side, RLS-scoped read the card list used — so search / filter / sort /
// pagination are applied in fetchDataFn. Prod holds ~30 events, so paging the
// whole set client-side is cheaper than a round trip per keystroke.
//
// Permissions: Edit is offered to every page viewer, unchanged from the card
// list it replaces. The catalog has no events.edit key; DB authority is the
// existing events_auth_update RLS policy, and a denied update surfaces an error
// toast (an UPDATE policy exists, so no silent 0-row no-op).
//
// Delete IS key-gated — `events.delete`, added 2026-08-06 along with an RLS
// policy that replaced one granting DELETE to every user carrying an
// institution_id. The gate lives in row-actions.tsx (canAccess) so the check
// runs per row; this component only owns the mutation and the in-flight row id.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, MapPin } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import {
  useDeleteEvent,
  useUpdateGeneralEventStatus,
} from '@/hooks/events/use-general-events';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import type { Event, EventStatus } from '@/types/events';
import { getColumns } from './columns';
import { EditGeneralEventDialog } from './edit-general-event-dialog';
import {
  consoleHrefFor,
  eventDateValue,
  eventStatusLabel,
  eventVenueValue,
  formatEventType,
  isEventOpen,
} from './event-display';

const ALL = 'all';

/** Sort keys that aren't plain Event fields need their accessor here. */
const SORT_ACCESSORS: Record<string, (e: Event) => unknown> = {
  date: eventDateValue,
  venue: eventVenueValue,
  naac: (e) => (e.naac_criteria ?? []).length,
};

export function EventsDataTable() {
  const router = useRouter();
  const updateStatus = useUpdateGeneralEventStatus();
  const deleteEvent = useDeleteEvent();

  // Ownership is per row, but the viewer is not — resolve them once here and
  // pass down, rather than resolving identity in every rendered row action.
  //
  // Two hooks on purpose: useAuth() carries only { profile, isLoading, error },
  // and isSuperAdmin is `role === 'super_admin' || is_super_admin === true`,
  // which usePermissions() already computes. `profile.id` IS the auth uid —
  // profiles.id = auth.uid() is an invariant here — so it is the right value to
  // compare against events.created_by.
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const viewer = useMemo(
    () => ({
      userId: profile?.id,
      institutionId: profile?.institution_id,
      isSuperAdmin,
    }),
    [profile?.id, profile?.institution_id, isSuperAdmin]
  );

  // The general-event mutation hooks invalidate ['general-events', …]; bridge
  // those into this fetchDataFn-mode table (it bypasses React Query entirely).
  const refetchKey = useDataTableRefreshOnInvalidate(['general-events']);

  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  // Discovered from the fetched rows: live event_type values are wider than the
  // TS EventType union, so a hardcoded option list would miss real types.
  const [typeOptions, setTypeOptions] = useState<string[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  const handleOpen = useCallback(
    (event: Event) => router.push(consoleHrefFor(event)),
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

  const handleDelete = useCallback((id: string) => deleteEvent.mutate(id), [deleteEvent]);

  // The mutation's own isPending is table-wide; pairing it with the id being
  // deleted keeps the spinner on the row that was clicked.
  const deletingId = deleteEvent.isPending ? (deleteEvent.variables ?? null) : null;

  const columns = useMemo(
    () =>
      getColumns({
        viewer,
        onOpen: handleOpen,
        onEdit: handleEdit,
        onStatusChange: handleStatusChange,
        onDelete: handleDelete,
        deletingId,
      }),
    [viewer, handleOpen, handleEdit, handleStatusChange, handleDelete, deletingId]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const all = await EventBaseService.getEvents({});

      // Refresh the Type dropdown from what actually came back. Guarded so an
      // unchanged set doesn't re-render on every fetch.
      const discovered = Array.from(new Set(all.map((e) => e.event_type as string))).sort();
      setTypeOptions((prev) =>
        prev.length === discovered.length && prev.every((t, i) => t === discovered[i])
          ? prev
          : discovered
      );

      let rows = all;

      if (typeFilter !== ALL) {
        rows = rows.filter((e) => (e.event_type as string) === typeFilter);
      }
      if (statusFilter !== ALL) {
        const wantOpen = statusFilter === 'active';
        rows = rows.filter((e) => isEventOpen(e) === wantOpen);
      }
      if (params.search) {
        const q = params.search.toLowerCase();
        rows = rows.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            formatEventType(e.event_type as string).toLowerCase().includes(q) ||
            eventVenueValue(e).toLowerCase().includes(q) ||
            (e.description ?? '').toLowerCase().includes(q)
        );
      }

      const sortBy = params.sort_by || 'created_at';
      const accessor =
        SORT_ACCESSORS[sortBy] ?? ((e: Event) => (e as unknown as Record<string, unknown>)[sortBy]);
      const dir = params.sort_order === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = accessor(a);
        const bv = accessor(b);
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
    // Filter state is a real dependency: the DataTable re-runs its fetch effect
    // when fetchDataFn's identity changes, which is how a filter change reloads.
    [typeFilter, statusFilter]
  );

  const renderToolbar = () => (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="h-8 w-[160px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {typeOptions.map((t) => (
            <SelectItem key={t} value={t}>
              {formatEventType(t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // Phones get a tappable card instead of a 7-column scroll. Removing the old
  // card list entirely would otherwise be a straight mobile regression.
  const renderMobileCard = (event: Event) => {
    const date = eventDateValue(event);
    const venue = eventVenueValue(event);
    return (
      <Link href={consoleHrefFor(event)} className="block rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{event.name}</span>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {formatEventType(event.event_type as string)}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold ${
              isEventOpen(event)
                ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                : ''
            }`}
          >
            {eventStatusLabel(event)}
          </Badge>
        </div>
        {(date || venue) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {new Date(date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
            {venue && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {venue}
              </span>
            )}
          </div>
        )}
      </Link>
    );
  };

  // Why the casts below: DataTable constrains TData to ExportableData, which is
  // a FLAT record of primitives (components/data-table/utils/export-utils.ts).
  // `Event` carries naac_criteria: string[] and branding_config:
  // Record<string, unknown>, so it cannot satisfy that constraint — the generic
  // falls back to ExportableData and every Event-typed callback fails to
  // assign. Each Event-typed prop therefore crosses this one boundary with a
  // cast. (The sibling tournament table hits the same wall; it casts `columns`
  // and leaves fetchDataFn + renderToolbarContent erroring.) Delete these the
  // day DataTable's constraint is widened to allow nested fields.
  return (
    <>
      <DataTable
        fetchDataFn={fetchData as never}
        getColumns={() => columns as never}
        renderMobileRow={renderMobileCard as never}
        exportConfig={{
          entityName: 'events',
          columnMapping: {
            name: 'Event',
            event_type: 'Type',
            event_date: 'Date',
            venue: 'Venue',
            status: 'Status',
          },
          columnWidths: [{ wch: 36 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 12 }],
          headers: ['name', 'event_type', 'event_date', 'venue', 'status'],
          // Raw DB values would export 'sports_tournament' / 'live'; ship the
          // same labels the table shows so the sheet matches the screen.
          // Returns only the exported columns — a genuinely flat record, unlike
          // a {...row} spread which would drag nested Event fields into it.
          transformFunction: ((row: Event) => ({
            name: row.name,
            event_type: formatEventType(row.event_type as string),
            event_date: eventDateValue(row) ?? '',
            venue: eventVenueValue(row),
            status: eventStatusLabel(row),
          })) as never,
        }}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: false,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'events-all-table',
        }}
        renderToolbarContent={renderToolbar}
        refetchKey={refetchKey}
      />

      <EditGeneralEventDialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        event={editing}
      />
    </>
  );
}
