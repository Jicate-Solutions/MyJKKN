// app/(routes)/meetings/[uid]/page.tsx
//
// Single booking detail view — Phase N2: sourced from the NATIVE
// meeting_bookings table (in-house engine, migration 20260611190000), not the
// Cal.com webhook mirror. RLS (mb_host_select) means hosts only see their own
// rows; unauthorized access on a valid uid returns notFound().
//
// Mutations: host cancel happens IN-APP via cancelMyBooking (server action) —
// the external jicate-booking deep-links are gone. Reschedule v1 = cancel +
// rebook.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Mail,
  Phone,
  User,
  AlertTriangle,
  ListChecks,
  ListTodo,
  History,
  Repeat,
  Video,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { MeetingAgendaService } from '@/lib/services/meetings/meeting-agenda-service';
import { MeetingActionItemService } from '@/lib/services/meetings/meeting-action-item-service';
import { MeetingPersonHistoryService } from '@/lib/services/meetings/meeting-person-history-service';
import {
  effectiveLocationMode,
  switchBackState,
  switchRequestState,
  switchSourceMode,
} from '@/lib/services/meetings/meeting-mode-switch';
import { CancelBookingButton } from './_components/cancel-booking-button';
import { RescheduleBookingButton } from './_components/reschedule-booking-button';
import { SwitchToOnlineButton } from './_components/switch-to-online-button';
import { SwitchBackButton } from './_components/switch-back-button';
import { ModeSwitchRequestButtons } from './_components/mode-switch-request-buttons';
import { MarkOutcomeButtons } from './_components/mark-outcome-buttons';
import { AgendaSection } from './_components/agenda-section';
import { ActionItemsSection } from './_components/action-items-section';
import { CarriedOverSection } from './_components/carried-over-section';
import { PersonHistorySection } from './_components/person-history-section';

const BREADCRUMB_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Meetings', href: '/meetings/inbox' },
  { label: 'Booking' },
] as const;

interface DetailPageProps {
  params: Promise<{ uid: string }>;
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  completed: 'outline',
  no_show: 'outline',
  cancelled: 'destructive',
};

function formatBookingTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

export default async function MeetingDetailPage({ params }: DetailPageProps) {
  const { uid } = await params;
  // Native tables aren't in generated types yet → untyped client (TS2589 class).
  const supabase = (await createClient()) as unknown as SupabaseClient;

  const { data: booking, error } = await supabase
    .from('meeting_bookings')
    .select('*')
    .eq('uid', uid)
    .maybeSingle();

  if (error) {
    return (
      <ContentLayout title="Meeting">
        <PageBreadcrumb items={[...BREADCRUMB_ITEMS]} />
        <div className="space-y-4 mt-4">
          <PageHeader title="Meeting" description="Failed to load booking." />
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" aria-hidden />
              {error.message}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (!booking) {
    notFound();
  }

  // host display info (native bookings store the profile id only)
  const { data: host } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', booking.host_profile_id)
    .maybeSingle();

  // WHO closed this meeting — a different question from who hosts it. Until
  // 20260926010000 the record could only hold an actor KIND ('host'/'system'),
  // so a super admin closing the Director's meeting was displayed as the
  // Director. outcome_marked_by_profile_id now carries the real person.
  // Re-uses the host record when they are the same person rather than issuing
  // a second identical query.
  const markedById = booking.outcome_marked_by_profile_id as string | null;
  let markedBy: { full_name?: string | null; email?: string | null } | null = null;
  if (markedById) {
    if (markedById === booking.host_profile_id) {
      markedBy = host;
    } else {
      const { data: markerProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', markedById)
        .maybeSingle();
      markedBy = markerProfile;
    }
  }
  const markedByName = markedBy?.full_name || markedBy?.email || null;

  // meeting type title (nullable — type may have been soft-deleted).
  // location_mode + min_notice_min are read here rather than in a second query:
  // they are what decide whether this booking can be switched to a Google Meet
  // and whether a visitor's pending request is still live.
  const { data: meetingType } = booking.meeting_type_id
    ? await supabase
        .from('meeting_types')
        .select('title, duration_min, location_mode, min_notice_min')
        .eq('id', booking.meeting_type_id)
        .maybeSingle()
    : { data: null };

  // Agenda (Meeting Agenda Engine PR1). Read via the same session client — RLS
  // keeps it host-scoped. canEdit is the booking host only (admins may view via
  // RLS but edit stays host-only in v1, matching the cancel action's scope).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { items: agendaItems } = await MeetingAgendaService.getAgenda(supabase, booking.id);
  const actionItems = await MeetingActionItemService.listForBooking(supabase, booking.id);
  const carriedOver = await MeetingActionItemService.listOpenCarryOver(supabase, booking.id);
  // Past meetings with this person. Same session client, same RLS, and matched
  // on attendee_email exactly as listOpenCarryOver above — the two panels sit
  // next to each other and must agree on who "this person" is. Returns null
  // when there is no prior history, and the panel is then not rendered at all.
  const personHistory = await MeetingPersonHistoryService.getForBooking(supabase, booking.id);
  const canEditAgenda = !!user && user.id === booking.host_profile_id;

  const duration = durationMinutes(booking.start_time, booking.end_time);
  const isCancelled = booking.status === 'cancelled';
  const isPast =
    booking.status === 'completed' ||
    booking.status === 'no_show' ||
    new Date(booking.end_time).getTime() < Date.now();

  // Whether the meeting HAPPENED is a separate question from whether it is
  // over: a no-show is knowable the moment the slot begins, so this gate uses
  // start_time while isPast (which hides reschedule/cancel) uses end_time.
  //
  // Since 20260926010000 a super admin may also close a meeting on the host's
  // behalf, and is recorded by name when they do. This only decides whether the
  // buttons are worth rendering — fn_meeting_mark_outcome re-checks both arms
  // server-side, so hiding the buttons is never the security boundary.
  const isOpenAndStarted =
    booking.status === 'confirmed' &&
    new Date(booking.start_time).getTime() < Date.now();
  const isHost = !!user && user.id === booking.host_profile_id;
  // Only ask the database about super-admin when the answer could change
  // anything: a host already qualifies, and nobody qualifies on a booking that
  // is not both open and started.
  const { data: isSuperAdmin } =
    isOpenAndStarted && !!user && !isHost
      ? await supabase.rpc('is_super_admin')
      : { data: false };
  const canMark = isOpenAndStarted && (isHost || !!isSuperAdmin);

  // Mode switch (2026-08-19, widened 2026-08-21). Three independent questions:
  //   • canSwitchToOnline — may the host turn this booking into a Google Meet?
  //     Since ruling 1 that is in-person AND phone bookings; switchSourceMode
  //     still rejects anything unrecognised rather than waving it through.
  //   • canSwitchBack — may the host turn a video meeting back? Ruling 2 makes
  //     this HOST ONLY, so unlike canSwitchToOnline it carries an explicit host
  //     check here as well (same pattern as canMark below). A booking that is
  //     online because its TYPE is online reads as 'online_by_type' and offers
  //     nothing, because clearing the override could not change it.
  //   • hasPendingSwitchRequest — is a visitor's request still live? A request
  //     whose notice window has closed reads as 'expired' and is treated as
  //     declined (decision B), so it must not offer the host an Approve button
  //     the service would then refuse.
  // All three are re-checked server-side inside the actions; these only decide
  // what is worth rendering.
  const isOnline =
    effectiveLocationMode(meetingType?.location_mode, booking.location_mode_override) ===
    'online';
  const canSwitchToOnline =
    !isCancelled &&
    !isPast &&
    switchSourceMode(meetingType?.location_mode, booking.location_mode_override) === 'switchable';
  const canSwitchBack =
    !isCancelled &&
    !isPast &&
    !!user &&
    user.id === booking.host_profile_id &&
    switchBackState(meetingType?.location_mode, booking.location_mode_override) === 'switchable';
  // Where it lands once the override is cleared — the meeting type's own mode.
  const switchBackTo =
    effectiveLocationMode(meetingType?.location_mode, null) === 'phone' ? 'phone' : 'in_person';
  const hasPendingSwitchRequest =
    !isCancelled &&
    !isPast &&
    switchRequestState(booking, meetingType?.min_notice_min) === 'pending';

  const answers: Record<string, string> =
    booking.answers && typeof booking.answers === 'object' && !Array.isArray(booking.answers)
      ? booking.answers
      : {};

  return (
    <ContentLayout title={`Meeting with ${booking.attendee_name || booking.attendee_email}`}>
      <PageBreadcrumb items={[...BREADCRUMB_ITEMS]} />
      <div className="space-y-4 mt-4">
        <Link href="/meetings/inbox" className="inline-flex">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Back to inbox
          </Button>
        </Link>

        <PageHeader
          title={`Meeting with ${booking.attendee_name || booking.attendee_email}`}
          description={`${meetingType?.title ?? 'Booking'} · ${booking.uid}`}
        />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Schedule</CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[booking.status] ?? 'outline'}>
                {booking.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>{formatBookingTime(booking.start_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>
                {duration} {duration === 1 ? 'minute' : 'minutes'} · IST
              </span>
            </div>
            {/* Once a booking is online the Meet link is the only way to join
                it, so it belongs on the page that offers the switch. */}
            {isOnline ? (
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-muted-foreground" aria-hidden />
                {booking.video_url ? (
                  <a
                    href={booking.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Join the Google Meet
                  </a>
                ) : (
                  <span>Online meeting</span>
                )}
              </div>
            ) : null}
            {booking.cancellation_reason ? (
              <div className="rounded-md bg-destructive/10 p-2 text-xs">
                <strong>Cancellation reason:</strong> {booking.cancellation_reason}
              </div>
            ) : null}
            {/* An assumed outcome is not an observed one — say which this is,
                and name the person whenever the record knows who they were.
                Rows marked before 20260926010000 carry only the actor kind, so
                for those the name is unavailable rather than wrong: they fall
                back to naming the kind, never to guessing a person. */}
            {booking.outcome_marked_by ? (
              <p className="text-xs text-muted-foreground">
                {booking.outcome_marked_by === 'system'
                  ? 'Closed automatically before 21 August 2026 — nobody confirmed it took place.'
                  : markedByName
                    ? `Closed by ${markedByName}.`
                    : booking.outcome_marked_by === 'host'
                      ? 'Recorded by the host.'
                      : 'Recorded by an administrator.'}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Attendee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>{booking.attendee_name || '(no name provided)'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
              <a
                href={`mailto:${booking.attendee_email}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {booking.attendee_email}
              </a>
            </div>
            {booking.attendee_phone ? (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                <a
                  href={`tel:${booking.attendee_phone}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {booking.attendee_phone}
                </a>
              </div>
            ) : null}
            {Object.keys(answers).length > 0 ? (
              <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
                {Object.entries(answers).map(([q, a]) => (
                  <div key={q}>
                    <span className="text-muted-foreground">{q}:</span>{' '}
                    <span className="font-medium">{a}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Directly under Attendee, because it answers the next question that
            card raises: have I dealt with this person before? Rendered only
            when there IS history — an empty "no past meetings" box would be
            noise on every first meeting, which is most of them. */}
        {personHistory ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden />
                <CardTitle className="text-base">Past meetings with this person</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <PersonHistorySection history={personHistory} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Host</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>{host?.full_name || host?.email || 'Unknown host'}</span>
            </div>
            {host?.email ? (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span>{host.email}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-base">Agenda</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <AgendaSection
              bookingId={booking.id}
              uid={booking.uid}
              canEdit={canEditAgenda}
              items={agendaItems.map((i) => ({
                id: i.id,
                title: i.title,
                body: i.body,
                order_index: i.order_index,
              }))}
            />
          </CardContent>
        </Card>

        {carriedOver.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" aria-hidden />
                <CardTitle className="text-base">Carried over from earlier meetings</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CarriedOverSection uid={booking.uid} canEdit={canEditAgenda} items={carriedOver} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-base">Decisions &amp; Action Items</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ActionItemsSection
              bookingId={booking.id}
              uid={booking.uid}
              canEdit={canEditAgenda}
              items={actionItems.map((i) => ({
                id: i.id,
                action_text: i.action_text,
                decision_text: i.decision_text,
                owner_label: i.owner_label,
                due_date: i.due_date,
                status: i.status,
              }))}
            />
          </CardContent>
        </Card>

        {hasPendingSwitchRequest ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-muted-foreground" aria-hidden />
                <CardTitle className="text-base">
                  {booking.mode_switch_requested_by === 'host'
                    ? 'A switch to Google Meet is waiting'
                    : `${booking.attendee_name || booking.attendee_email} asked to make this a video call`}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nothing has changed yet — the meeting is still in person until you
                approve. Approving adds a Google Meet link to the calendar event and
                emails both of you.
              </p>
              {booking.mode_switch_requested_at ? (
                <p className="text-xs text-muted-foreground">
                  Asked on {formatBookingTime(booking.mode_switch_requested_at)}.
                </p>
              ) : null}
              {booking.mode_switch_requested_start ? (
                <p className="text-xs text-muted-foreground">
                  They also asked to move it to{' '}
                  {formatBookingTime(booking.mode_switch_requested_start)}. Approving
                  moves the meeting as well as switching it.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  They did not ask to change the time.
                </p>
              )}
              <ModeSwitchRequestButtons uid={booking.uid} />
            </CardContent>
          </Card>
        ) : null}

        {canMark ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Did this meeting happen?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nothing is recorded until you say so. Until you do, this meeting stays
                under Awaiting you on your meetings list. It is no longer closed
                automatically after seven days.
              </p>
              <MarkOutcomeButtons uid={booking.uid} />
            </CardContent>
          </Card>
        ) : null}

        {/* The Actions card is no longer hidden once a meeting has ended: a host
            must be able to move a meeting that was missed (Director ruling
            2026-08-21). Each control decides for itself —
              • Reschedule asks for a reason when the meeting has ended.
              • Switch-to-online stays hidden via canSwitchToOnline, which
                already excludes already-online, cancelled and past.
              • Switch-back stays hidden via canSwitchBack, which additionally
                requires the viewer to BE the host (ruling 2, 2026-08-21).
              • Cancel is pointless once the meeting is over, so it keeps the
                original rule and hides. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RescheduleBookingButton uid={booking.uid} hasEnded={isPast || isCancelled} />
            {canSwitchToOnline ? <SwitchToOnlineButton uid={booking.uid} /> : null}
            {canSwitchBack ? (
              <SwitchBackButton uid={booking.uid} backTo={switchBackTo} />
            ) : null}
            {!isCancelled && !isPast ? <CancelBookingButton uid={booking.uid} /> : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Source of truth: MyJKKN native scheduling
          {booking.source === 'ported-from-cal' ? ' (ported from Cal.com)' : ''}
        </p>
      </div>
    </ContentLayout>
  );
}
