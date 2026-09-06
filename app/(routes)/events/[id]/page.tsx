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
  Building2,
  CalendarDays,
  CalendarClock,
  Clock,
  Hash,
  MapPin,
  Pencil,
  Loader2,
  ChevronRight,
  Eye,
  Globe,
  ShieldCheck,
  Star,
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
import { EventLogistics } from '@/components/events/shared/event-logistics';
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
import { canEditEvent } from '../_components/event-display';
import { EventFormCards } from '@/components/events/registration/event-form-cards';
import { EventFeedbackLinkCard } from '@/components/events/feedback/event-feedback-link-card';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

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

/** "9:30 am" from a time or timestamp column; null when unparseable. */
const formatTime = (value: string | null) => {
  if (!value) return null;
  // start_time/end_time are `time` columns ("09:30:00"), which Date() cannot
  // parse on its own — give them a date before handing them over.
  const d = new Date(/^\d{2}:\d{2}/.test(value) ? `1970-01-01T${value}` : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

/** A date range that collapses to one date when both ends match (or one is absent). */
const formatRange = (from: string | null, to: string | null) => {
  const a = formatDate(from);
  const b = formatDate(to);
  if (a && b) return a === b ? a : `${a} → ${b}`;
  return a ?? b ?? null;
};

/** One labelled fact in the details grid. Renders a muted dash rather than vanishing,
 *  so a missing value reads as "not set" instead of the row silently disappearing. */
function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">
          {value || <span className="font-normal text-muted-foreground">Not set</span>}
        </p>
      </div>
    </div>
  );
}

/**
 * Draft <-> Active. General events run the 2-state model in
 * GENERAL_EVENT_STATUS_TRANSITIONS: Draft hides the event and closes
 * registration, Active opens it. The shared 8-state lifecycle is never offered
 * here — it has no draft -> live edge, so a one-click activation gated on it
 * would be rejected server-side.
 */
function GeneralEventStatusControl({
  event,
  canEdit,
}: {
  event: Event;
  canEdit: boolean;
}) {
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
      {/* Read-only viewers keep the status badge and lose the lever. */}
      {canEdit && (
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
      )}
    </div>
  );
}

/**
 * Public visibility. Separate lever from status on purpose: the public read
 * policy is `is_public = true AND status NOT IN ('draft','cancelled')`, and the
 * create wizard files every general event with is_public = false — so
 * activating alone never makes an event publicly visible.
 */
function PublicVisibilityToggle({
  event,
  canEdit,
}: {
  event: Event;
  canEdit: boolean;
}) {
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
        // Non-owners still see the current visibility — they just can't move it.
        disabled={!canEdit || update.isPending}
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
  const { institutions } = useInstitutionsWithAccess();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Whoever created the event edits it; everyone else reads it. Mirrors the
  // events_auth_update policy — see canEditEvent. Every write lever on this page
  // (status, public visibility, the Edit dialog) hangs off this one flag.
  // profile.id is the auth uid (profiles.id = auth.uid()), so it is what
  // events.created_by is compared against.
  const canEdit =
    !!event &&
    canEditEvent(event, {
      userId: profile?.id,
      institutionId: profile?.institution_id,
      isSuperAdmin,
    });

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

  const dateLabel =
    formatRange(event.event_date ?? event.start_date, event.end_date) ?? null;

  const startTime = formatTime(event.start_time ?? event.start_date);
  const endTime = formatTime(event.end_time ?? event.end_date);
  const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : startTime;

  const registrationWindow = formatRange(
    event.registration_open_date,
    event.registration_close_date
  );

  const capacityLabel = event.max_registrations
    ? `${event.max_registrations} max${event.target_registrations ? ` · ${event.target_registrations} target` : ''}`
    : event.target_registrations
      ? `${event.target_registrations} target`
      : null;

  const createdLabel = formatDate(event.created_at);

  // Resolve the host institution's NAME from the list the user can already see.
  // The event row carries only institution_id, and a separate fetch per event
  // detail view would be a round-trip for one string this hook already holds.
  const hostName =
    institutions.find((i) => i.id === event.institution_id)?.name ?? null;

  const config = event.config as Record<string, unknown> | null;
  const home = config?.home as string | undefined;
  // Which Event Logistics tabs this event was created with. Absent (every event
  // made before the tools picker existed) means "all of them" — see tabVisible.
  const enabledTools = Array.isArray(config?.enabled_tools)
    ? (config.enabled_tools as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      )
    : null;

  // In-charges are an ACCESS GRANT, not a label: fn_is_event_incharge() matches
  // auth.uid() against config->incharges[].member_id to back the RLS policies
  // and API gates. Showing them here is how an organizer can see who currently
  // holds that grant.
  const incharges = Array.isArray(config?.incharges)
    ? (config.incharges as { member_id?: string; name?: string }[]).filter(
        (i) => i && typeof i.name === 'string',
      )
    : [];
  // Chief guests are display data only (see the create form's People tab).
  const chiefGuests = Array.isArray(config?.chief_guests)
    ? (config.chief_guests as {
        name?: string;
        designation?: string;
        organization?: string;
      }[]).filter((g) => g && typeof g.name === 'string')
    : [];
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
            <GeneralEventStatusControl event={event} canEdit={canEdit} />
            {canEdit ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            ) : (
              // Say why the lever is missing. An absent Edit button with no
              // explanation reads as a broken page, not as a permission.
              <Badge variant="outline" className="gap-1.5 text-[10px] font-normal">
                <Eye className="h-3 w-3 opacity-60" />
                View only — owned by its creator
              </Badge>
            )}
          </div>
        </div>

        {/* Details left, the levers that change what the world sees on the right. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Event details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Fact icon={CalendarDays} label="Date" value={dateLabel} />
                <Fact icon={Clock} label="Time" value={timeLabel} />
                <Fact
                  icon={MapPin}
                  label="Venue"
                  value={event.venue || event.venue_text}
                />
                <Fact icon={Building2} label="Host institution" value={hostName} />
                <Fact
                  icon={CalendarClock}
                  label="Registration window"
                  value={registrationWindow}
                />
                <Fact icon={Users} label="Capacity" value={capacityLabel} />
              </div>

              {event.description && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="whitespace-pre-line text-sm">{event.description}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">NAAC evidence criteria</p>
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

              {/* People — who runs it (an access grant) and who is honoured at
                  it (display only). Both are set on the create wizard's People
                  tab and live in events.config. */}
              {(incharges.length > 0 || chiefGuests.length > 0) && (
                <div className="grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      In-charge
                    </p>
                    {incharges.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {incharges.map((i, idx) => (
                          <Badge
                            key={i.member_id ?? idx}
                            variant="secondary"
                            className="text-[11px] font-normal"
                          >
                            {i.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nobody — only holders of the events manage permission can run it.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="h-3.5 w-3.5" />
                      Chief guest
                    </p>
                    {chiefGuests.length > 0 ? (
                      <ul className="space-y-0.5 text-sm">
                        {chiefGuests.map((g, idx) => (
                          <li key={idx}>
                            <span className="font-medium">{g.name}</span>
                            {(g.designation || g.organization) && (
                              <span className="text-muted-foreground">
                                {' — '}
                                {[g.designation, g.organization].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not recorded.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" />
                  {event.slug}
                </span>
                {event.year && <span>Year {event.year}</span>}
                {createdLabel && <span>Created {createdLabel}</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Visibility</CardTitle>
              <CardDescription>
                Who can see this event, and whether outsiders may register.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PublicVisibilityToggle event={event} canEdit={canEdit} />
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">External registration</span>
                  <Badge variant={event.allow_external_registration ? 'success' : 'secondary'}>
                    {event.allow_external_registration ? 'Allowed' : 'JKKN only'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Audience</span>
                  <Badge variant="outline">{event.visibility ?? 'institution'}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Registration forms — an event holds many (one per monthly run).
            Rendering the live list here is safe because listForms() is a pure
            SELECT; the old single-link card avoided any live read because its
            only reader, getOrCreateForm(), INSERTS a row on first read. */}
        <EventFormCards
          eventId={event.id}
          editHrefFor={(formId) => `/events/${event.id}/registration-form?form=${formId}`}
          // General events register at /p/event/…, not /p/tournament/… — this
          // grid used to hardcode the tournament path, so every link and QR it
          // produced was dead.
          variant="general"
          eventName={event.name}
        />

        {isSchoolOfInfluence && (
          <p className="text-xs text-muted-foreground">
            These forms are what applicants answer on the School of Influencer
            application page below.
          </p>
        )}

        {/* Post-event feedback. Deliberately NOT gated on `canEdit`: that rule
            (canEditEvent) recognises only the creator, the super admin and
            same-institution rows, while the DB's fn_can_manage_event_feedback
            also counts the event in-charge from events.config->'incharges'.
            Gating on canEdit hid the card outright from the appointed
            coordinator. Consistent with this page's header decision — the DB
            is the authority, and a denial surfaces as an error toast. */}
        <EventFeedbackLinkCard eventId={event.id} />

        {/* Shared event logistics — sponsors, budget, committees, check-in, QR,
            volunteers, incidents, certificates, bulk import, analytics, kit.
            Tournaments have had these since Events Platform PR1; a wizard-created
            lecture or cultural programme had none of them, so it could be created
            and then never actually run from its own console.

            hideSensitiveWithoutManage: unlike the tournament console, this page
            has NO client-side access gate (see the file header) — anyone who can
            read the event row reads the page. `canManage={false}` only makes the
            boards read-only, so without this flag every viewer of every general
            event could read sponsor amounts, budget lines and incident reports.
            RLS does not cover those tables. */}
        <EventLogistics
          eventId={event.id}
          eventType={event.event_type as string}
          canManage={canEdit}
          enabledTools={enabledTools}
          hideSensitiveWithoutManage
        />

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
