'use client';

// Events Hub — general event DETAIL console. The first management surface for a
// wizard-created event beyond the hub's inline row (which offered nothing but
// "Edit", leaving every such event stranded in `draft` with no way to activate
// it and no way to reach the registration-form builder).
//
// Deliberately focused: status, the existing edit dialog, public visibility,
// and a link to the form builder. Specialised event types are redirected to
// their own console rather than rendered here half-managed.
//
// Access follows the sibling hub section's decision: no client-side permission
// gate, because the DB authority is the existing `events_auth_update` policy
// (super admin / admin / administrator / event_coordinator / same institution)
// and an UPDATE policy exists, so a denial surfaces as an error toast rather
// than a silent 0-row no-op.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  MapPin,
  Pencil,
  Loader2,
  FileText,
  ChevronRight,
  Globe,
  Users,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { NaacCriteriaChips } from '@/components/events/shared/naac-criteria-field';
import {
  useGeneralEvent,
  useUpdateGeneralEvent,
  useUpdateGeneralEventStatus,
  DEDICATED_EVENT_CONSOLES,
} from '@/hooks/events/use-general-events';
import {
  GENERAL_EVENT_ACTIVE_STATUS,
  generalEventStatusLabel,
  isGeneralEventActive,
} from '@/types/events';
import type { Event, EventStatus } from '@/types/events';
import { SOI_EVENT_TYPE } from '@/lib/services/school-of-influence/constants';
import { EditGeneralEventDialog } from '../_components/edit-general-event-dialog';

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

/**
 * Draft <-> Active. General events run the 2-state model in
 * GENERAL_EVENT_STATUS_TRANSITIONS: Draft hides the event and closes
 * registration, Active opens it. The shared 8-state lifecycle is never offered
 * here — it has no draft -> live edge, so a one-click activation gated on it
 * would be rejected server-side.
 */
function GeneralEventStatusControl({ event }: { event: Event }) {
  const updateStatus = useUpdateGeneralEventStatus();
  const active = isGeneralEventActive(event.status);
  const target: EventStatus = active ? 'draft' : GENERAL_EVENT_ACTIVE_STATUS;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={`text-[10px] uppercase ${
          active
            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
            : ''
        }`}
      >
        {generalEventStatusLabel(event.status)}
        {active && (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        )}
      </Badge>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        disabled={updateStatus.isPending}
        onClick={() => updateStatus.mutate({ id: event.id, status: target })}
        title={
          active
            ? 'Move back to Draft — hides the event and closes registration'
            : 'Make this event Active so it is visible and open'
        }
      >
        {updateStatus.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        {active ? 'Move to Draft' : 'Make Active'}
      </Button>
    </div>
  );
}

/**
 * Public visibility. Separate lever from status on purpose: the public read
 * policy is `is_public = true AND status NOT IN ('draft','cancelled')`, and the
 * create wizard files every general event with is_public = false — so
 * activating alone never makes an event publicly visible.
 */
function PublicVisibilityToggle({ event }: { event: Event }) {
  const update = useUpdateGeneralEvent();
  const active = isGeneralEventActive(event.status);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="space-y-0.5">
        <Label htmlFor="ge-public" className="flex items-center gap-1.5">
          <Globe className="h-4 w-4 opacity-60" />
          Publicly visible
        </Label>
        <p className="text-xs text-muted-foreground">
          {event.is_public
            ? active
              ? 'Anyone with the link can see this event.'
              : 'Marked public, but still hidden while the event is a Draft.'
            : 'Only signed-in users at your institution can see this event.'}
        </p>
      </div>
      <Switch
        id="ge-public"
        checked={event.is_public}
        disabled={update.isPending}
        onCheckedChange={(next) =>
          update.mutate({ id: event.id, dto: { is_public: next } })
        }
      />
    </div>
  );
}

export default function GeneralEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading, isError } = useGeneralEvent(id);
  const [dialogOpen, setDialogOpen] = useState(false);

  // A specialised event type reached through this URL belongs to its own
  // console — this page cannot manage divisions, sessions or race ops.
  const dedicatedConsole = event
    ? DEDICATED_EVENT_CONSOLES[event.event_type as string]
    : undefined;

  useEffect(() => {
    if (event && dedicatedConsole) {
      router.replace(dedicatedConsole(event.id));
    }
  }, [event, dedicatedConsole, router]);

  if (isLoading) {
    return (
      <ContentLayout title="Event">
        <div className="mt-4 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !event) {
    return (
      <ContentLayout title="Event">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Events', href: '/events' },
            { label: 'Not found' },
          ]}
        />
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Event not found, or you don&apos;t have access to it.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/events">Back to Events</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (dedicatedConsole) return null; // redirecting to the specialised console

  const dateLabel = formatDate(event.event_date ?? event.start_date);
  const home = (event.config as Record<string, unknown> | null)?.home as
    | string
    | undefined;
  // Compared as a string, like formatEventType above: events.event_type is free
  // text in the database (spec §6 P3 — no CHECK constrains it), so the TS union
  // is a convenience listing rather than the real vocabulary.
  const isSchoolOfInfluence = (event.event_type as string) === SOI_EVENT_TYPE;

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.name },
        ]}
      />

      <div className="mt-4 space-y-4">
        {/* Header — identity on the left, the two levers on the right. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px] font-normal">
                {formatEventType(event.event_type as string)}
              </Badge>
              {home && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  {formatEventType(home)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GeneralEventStatusControl event={event} />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {dateLabel ?? 'No date set'}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {event.venue || event.venue_text || 'No venue set'}
              </span>
            </div>

            {event.description && (
              <p className="whitespace-pre-line text-sm">{event.description}</p>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                NAAC evidence criteria
              </p>
              {(event.naac_criteria ?? []).length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  <NaacCriteriaChips codes={event.naac_criteria ?? []} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No NAAC evidence tags yet — add them from Edit.
                </p>
              )}
            </div>

            <PublicVisibilityToggle event={event} />
          </CardContent>
        </Card>

        {/* Registration form. Deliberately a link, not a live field count: the
            form row is lazily CREATED on first read, so fetching it here would
            materialise a row (and hard-error under stricter RLS) merely by
            viewing the event. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Registration Form
            </CardTitle>
            <CardDescription>
              Build the questions attendees answer when they register for this
              event — sections, field types, required flags, and conditional
              logic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={`/events/${event.id}/registration-form`}>
                Manage registration form
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            {isSchoolOfInfluence ? (
              <p className="text-xs text-muted-foreground">
                This form is what applicants answer on the School of Influence
                application page below.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Note: the form is saved against this event, but general events do
                not yet have a public registration page — only sports tournaments
                have one today. Until that ships, use this to define the form;
                responses cannot be collected from the public site yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* School of Influence — the programme's application door. Shown only
            for the SoI event type so no other event grows a stray link; the
            page itself decides whether an applicant may apply, from the batches
            and the config, so this is a shortcut and never an authority. */}
        {isSchoolOfInfluence && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-4 w-4 text-muted-foreground" />
                Applications
              </CardTitle>
              <CardDescription>
                The page learners and team members use to apply to this
                programme. Each person applies for themselves — eligibility, the
                intake window and batch capacity are all checked when they submit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="gap-1.5">
                <Link href={`/events/${event.id}/apply`}>
                  Open the application page
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <EditGeneralEventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        event={event}
      />
    </ContentLayout>
  );
}
