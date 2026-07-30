'use client';

// Events Hub — "General events" section. The FIRST management surface for
// wizard-created events without a dedicated console (lectures, cultural
// programmes, convocations, …): the create wizard files them as base `events`
// rows and redirects here, but until now nothing listed them, so they could
// never be edited or NAAC-tagged. Lightweight list with NAAC evidence chips
// (read) + an edit dialog embedding NaacCriteriaField (write) — same
// components and EventBaseService.updateEvent write path as PR #2413.
//
// Self-contained loading/error/empty states: the hub's static cards render
// instantly and must never be blanked by this section's fetch (a skeleton —
// never `return null` — while loading; CLS lesson #2213). Edit is visible to
// every page viewer, symmetric with the wizard: DB authority is the existing
// events_auth_update RLS policy, and a denied update surfaces an error toast
// (an UPDATE policy exists, so no silent 0-row no-op).

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, MapPin, Pencil, Settings2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { generalEventStatusLabel, isGeneralEventActive } from '@/types/events';
import type { Event } from '@/types/events';
import { NaacCriteriaChips } from '@/components/events/shared/naac-criteria-field';
import { useGeneralEvents } from '@/hooks/events/use-general-events';
import { EditGeneralEventDialog } from './edit-general-event-dialog';

/** 'cultural' → 'Cultural', 'sports_day' → 'Sports Day' (raw types render readable). */
const formatEventType = (type: string) =>
  type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const formatDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

function GeneralEventRow({
  event,
  onEdit,
}: {
  event: Event;
  onEdit: (event: Event) => void;
}) {
  const dateLabel = formatDate(event.event_date ?? event.start_date);
  // Same 2-state vocabulary the detail console uses — the hub previously showed
  // raw lifecycle labels ("Post Event"), which no longer match the only two
  // states a general event can actually be set to.
  const active = isGeneralEventActive(event.status);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${event.id}`}
            className="text-sm font-medium hover:underline"
          >
            {event.name}
          </Link>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {formatEventType(event.event_type as string)}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] font-normal ${
              active
                ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                : ''
            }`}
          >
            {generalEventStatusLabel(event.status)}
          </Badge>
        </div>
        {(dateLabel || event.venue) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {dateLabel && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {dateLabel}
              </span>
            )}
            {event.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.venue}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {(event.naac_criteria ?? []).length > 0 ? (
            <NaacCriteriaChips codes={event.naac_criteria ?? []} />
          ) : (
            <span className="text-xs text-muted-foreground">
              No NAAC evidence tags yet
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Manage is the primary affordance: status, visibility and the
            registration-form builder all live on the detail console. Edit stays
            for the quick name/date/NAAC change that needs no page load. */}
        <Button asChild variant="default" size="sm" className="gap-1.5">
          <Link href={`/events/${event.id}`}>
            <Settings2 className="h-3.5 w-3.5" />
            Manage
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onEdit(event)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>
    </div>
  );
}

export function GeneralEventsSection() {
  const { data: events, isLoading, isError, refetch } = useGeneralEvents();
  const [editing, setEditing] = useState<Event | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openEdit = (event: Event) => {
    setEditing(event);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">General Events</CardTitle>
        <CardDescription>
          Events created with the wizard that have no dedicated console —
          lectures, cultural programmes, ceremonies, and more. Tag each one
          with NAAC evidence criteria so completed events emit accreditation
          evidence automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Could not load general events.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No general events yet — use “Create an Event” above to add one.
          </p>
        ) : (
          <div className="space-y-3">
            {(events ?? []).map((event) => (
              <GeneralEventRow key={event.id} event={event} onEdit={openEdit} />
            ))}
          </div>
        )}
      </CardContent>

      <EditGeneralEventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        event={editing}
      />
    </Card>
  );
}
