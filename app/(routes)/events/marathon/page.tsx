'use client';

// Marathon Events List — Mobile-first card layout
// Replaces DataTable with tappable event cards optimized for phone screens.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { useMarathonEvents, useUpdateMarathonStatus, useDeleteMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import {
  Loader2,
  Plus,
  Calendar,
  MapPin,
  Users,
  Trophy,
  ChevronRight,
  Search,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import type { Event, EventStatus } from '@/types/events';
import { EVENT_STATUS_TRANSITIONS } from '@/types/events';

// ============================================================================
// Status styling
// ============================================================================

const STATUS_CONFIG: Record<EventStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  planning: { label: 'Planning', color: 'text-blue-600', bg: 'bg-blue-50' },
  preparation: { label: 'Preparation', color: 'text-amber-600', bg: 'bg-amber-50' },
  execution: { label: 'Execution', color: 'text-orange-600', bg: 'bg-orange-50' },
  live: { label: 'LIVE', color: 'text-red-600', bg: 'bg-red-50' },
  post_event: { label: 'Post Event', color: 'text-purple-600', bg: 'bg-purple-50' },
  archived: { label: 'Archived', color: 'text-gray-500', bg: 'bg-gray-50' },
  cancelled: { label: 'Cancelled', color: 'text-red-500', bg: 'bg-red-50' },
};

// ============================================================================
// Days-to-event helper
// ============================================================================

function DaysToEvent({ date }: { date: string | null }) {
  if (!date) return null;
  const eventDate = new Date(date);
  const days = differenceInDays(eventDate, new Date());

  if (days < 0) return <span className="text-xs text-muted-foreground">Completed</span>;
  if (days === 0) return <span className="text-xs font-bold text-red-600 animate-pulse">TODAY</span>;
  if (days === 1) return <span className="text-xs font-semibold text-orange-600">Tomorrow</span>;
  if (days <= 7) return <span className="text-xs font-medium text-amber-600">{days} days away</span>;
  return <span className="text-xs text-muted-foreground">{days} days away</span>;
}

// ============================================================================
// Event Card (mobile-first)
// ============================================================================

function EventCard({
  event,
  access,
  onStatusChange,
  onDelete,
}: {
  event: Event;
  access: ReturnType<typeof useMarathonAccess>;
  onStatusChange: (id: string, status: EventStatus) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const statusConfig = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.draft;
  const allowedTransitions = EVENT_STATUS_TRANSITIONS[event.status] ?? [];

  return (
    <Card
      className="cursor-pointer active:scale-[0.98] transition-transform touch-manipulation"
      onClick={() => router.push(
        access.canManage
          ? `/events/marathon/${event.id}/dashboard`
          : `/events/marathon/${event.id}/registrations`
      )}
    >
      <CardContent className="p-4">
        {/* Top row: Status + Days */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusConfig.color} ${statusConfig.bg}`}>
            {event.status === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1" />}
            {statusConfig.label}
          </span>
          <DaysToEvent date={event.event_date} />
        </div>

        {/* Event name */}
        <h3 className="text-base font-semibold leading-tight mb-2">{event.name}</h3>

        {/* Date + Venue row */}
        <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-3">
          {event.event_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{format(new Date(event.event_date), 'EEEE, dd MMM yyyy')}</span>
              {event.start_time && <span>at {event.start_time.slice(0, 5)}</span>}
            </div>
          )}
          {event.venue && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </div>
          )}
        </div>

        {/* Quick stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
          {event.target_registrations && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>Target: {event.target_registrations?.toLocaleString()}</span>
            </div>
          )}
          {event.year && (
            <div className="flex items-center gap-1">
              <Trophy className="h-3 w-3" />
              <span>Edition {event.year}</span>
            </div>
          )}
          <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/50" />
        </div>

        {/* Quick action buttons — admin only, shown below card */}
        {access.canManage && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
            {allowedTransitions.length > 0 && (
              <select
                className="text-xs border rounded px-2 py-1.5 bg-background flex-1 min-h-[36px]"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onStatusChange(event.id, e.target.value as EventStatus);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>Change Status...</option>
                {allowedTransitions.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
                ))}
              </select>
            )}
            {access.isSuperAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-9 w-9 p-0 shrink-0"
                onClick={() => onDelete(event.id, event.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonEventsPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { selectedInstitutionId, loading: institutionLoading } = useUserInstitutionAccess();
  const access = useMarathonAccess();
  const institutionId = access.canManage ? '' : (selectedInstitutionId || profile?.institution_id || '');

  const updateStatus = useUpdateMarathonStatus();
  const deleteMutation = useDeleteMarathonEvent();
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [deleteEventName, setDeleteEventName] = useState('');
  const [search, setSearch] = useState('');

  const { data: events, isLoading, error, refetch } = useMarathonEvents(institutionId);

  // Filter events by search
  const filtered = (events ?? []).filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.name?.toLowerCase().includes(q) ||
      e.venue?.toLowerCase().includes(q) ||
      e.year?.toString().includes(q)
    );
  });

  if (authLoading || institutionLoading) {
    return (
      <ContentLayout title="Marathon Events">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Marathon Events">
      {/* Header — compact on mobile */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold truncate">Marathon Events</h1>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Manage events, registrations, and race operations.
          </p>
        </div>
        {access.canManage && (
          <Link href="/events/marathon/new">
            <Button size="sm" className="gap-1.5 shrink-0 h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Event</span>
              <span className="sm:hidden">New</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Search + Refresh bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-2">Failed to load events</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      )}

      {/* Event cards */}
      {!isLoading && !error && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>{search ? 'No events match your search.' : 'No marathon events yet.'}</p>
              {access.canManage && !search && (
                <Link href="/events/marathon/new">
                  <Button variant="outline" size="sm" className="mt-3">
                    <Plus className="h-4 w-4 mr-1" /> Create First Event
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                access={access}
                onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                onDelete={(id, name) => {
                  setDeleteEventId(id);
                  setDeleteEventName(name);
                }}
              />
            ))
          )}

          <p className="text-xs text-center text-muted-foreground pt-2">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteEventId}
        onOpenChange={(open) => { if (!open) { setDeleteEventId(null); setDeleteEventName(''); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Marathon Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&quot;{deleteEventName}&quot;</strong>?
              This will permanently delete all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteEventId) {
                  deleteMutation.mutate(deleteEventId);
                  setDeleteEventId(null);
                  setDeleteEventName('');
                }
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
