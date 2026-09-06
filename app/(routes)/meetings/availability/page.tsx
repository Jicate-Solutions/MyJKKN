// app/(routes)/meetings/availability/page.tsx
//
// NATIVE "My Availability" page.
//
// REPLACES the old broken implementation: the previous version iframed
// jicate-booking's Cal.com availability editor (JicateBookingEmbed
// mode="availability"). That iframe renders BROKEN — a cross-origin iframe
// can't hold a Cal.com session, so it forced users into a separate Cal.com
// login we explicitly do not want.
//
// This version is first-class MyJKKN UI. It calls Cal.com's v2 REST API
// SERVER-SIDE via the per-user "Path W" vaulted API key (the key never reaches
// the browser). The weekly-hours editor is a native Shadcn UI component.
//
// Flow:
//   1. Resolve the current user (explicit "not signed in" state — never a
//      silent redirect, CLAUDE.md rule #27).
//   2. getMySchedule() — which itself ensureProvisioned()s the Cal.com account
//      and creates a default schedule if the user has none yet, so the editor
//      is never blank.
//   3. Render AvailabilityEditor, or an explicit error card on failure.
//
// Design system copied from the sibling /meetings/inbox page: ContentLayout +
// PageBreadcrumb + PageHeader + Shadcn UI, plus a small Inbox/Availability/
// Manage tab bar for navigation between the three meetings surfaces.

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getMySchedule, getBookingPageState, listMySchedules } from './actions';
import { AvailabilityEditor } from './_components/availability-editor';
import { SchedulesCard } from './_components/schedules-card';
import { HolidaysEditor } from './_components/holidays-editor';
import { BookingPageCard } from './_components/booking-page-card';
import { IntegrationPrefsCard } from './_components/integration-prefs-card';
import { getIntegrationPrefs } from './_components/integration-prefs-actions';
import { DelegatesCard } from './_components/delegates-card';
import { getMyDelegates } from './_components/delegates-actions';

// Cal.com reads/writes are user-specific and mutable — never statically cache.
export const dynamic = 'force-dynamic';

const MEETINGS_TABS = [
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox' },
  { key: 'availability', label: 'My Availability', href: '/meetings/availability' },
  { key: 'manage', label: 'Manage Event Types', href: '/meetings/manage' },
] as const;

function MeetingsTabBar({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MEETINGS_TABS.map((t) => (
        <Link key={t.key} href={t.href} className="inline-flex">
          <Button variant={active === t.key ? 'default' : 'outline'} size="sm">
            {t.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="My Availability">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Availability' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="My Availability"
          description="Set the weekly hours you're available, connect Google Calendar, and control your public booking page."
        />
        <MeetingsTabBar active="availability" />
        {children}
      </div>
    </ContentLayout>
  );
}

export default async function MeetingsAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; schedule?: string }>;
}) {
  // ?google= is set by the OAuth callback redirect (U2) — banner only.
  // ?schedule= picks WHICH set of working hours the editor edits; a host may
  // keep more than one. An id they do not own falls back to their own default.
  const { google: googleFlag, schedule: selectedScheduleId } = await searchParams;

  // Explicit auth gate — render a clear message, never silently redirect.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You are not signed in</h3>
            <p className="text-xs text-muted-foreground">
              Please sign in to MyJKKN to manage your availability.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // getMySchedule() runs ensureProvisioned() internally and creates a default
  // schedule for brand-new accounts, so a successful result always has data.
  const result = await getMySchedule(selectedScheduleId);

  // `result.data` is optional on the flat ActionResult shape; treat a missing
  // payload the same as an explicit failure so we never render a blank editor.
  if (!result.success || !result.data) {
    return (
      <Shell>
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive/60" aria-hidden />
            <h3 className="text-sm font-medium">Couldn&apos;t load your availability</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              {result.error ?? 'Your availability could not be loaded.'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              If this keeps happening, contact your MyJKKN administrator.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // U3: Google connection + public-page settings (Universal Booking). A load
  // failure here degrades to just not rendering the cards — the availability
  // editor must never be blocked by the newer feature.
  const pageState = await getBookingPageState();

  // Wave-3: the host's video provider preference for online meeting types. A
  // load failure degrades to simply not rendering the card — it must never
  // block the availability editor.
  const prefsState = await getIntegrationPrefs();

  // Who the host has let manage their calendar (e.g. a PA). Degrades to simply
  // not rendering the card on failure — it must never block the editor.
  const delegatesState = await getMyDelegates();

  // Every set of working hours this host keeps. A load failure degrades to
  // simply not rendering the card — it must never block the editor, and a host
  // with one set is exactly where they were before.
  const schedulesState = await listMySchedules();

  // Bookable meeting-type count — drives the "your link won't accept bookings
  // until you add a meeting type" warning on the booking-page card. A booking
  // link with zero meeting types renders the public "not accepting bookings"
  // state (BUG-004267); warn the host before they share a dead link.
  const { count: meetingTypeCount } = await supabase
    .from('meeting_types')
    .select('id', { count: 'exact', head: true })
    .eq('host_profile_id', user.id)
    .eq('is_active', true)
    .eq('hidden', false);

  return (
    <Shell>
      {schedulesState.success && schedulesState.data?.length ? (
        <SchedulesCard
          initial={schedulesState.data}
          selectedId={result.data.scheduleId}
        />
      ) : null}
      {/*
        Both editors hold the loaded schedule in useState, so switching sets
        must REMOUNT them — without the key React would keep showing the
        previous set's hours under the new set's name.
      */}
      <AvailabilityEditor key={result.data.scheduleId} schedule={result.data} />
      <HolidaysEditor
        key={`holidays-${result.data.scheduleId}`}
        scheduleId={result.data.scheduleId}
      />
      {pageState.success && pageState.data && (
        <BookingPageCard
          initial={pageState.data}
          googleFlag={googleFlag}
          meetingTypeCount={meetingTypeCount ?? 0}
        />
      )}
      {prefsState.success && prefsState.data && (
        <IntegrationPrefsCard initial={prefsState.data} />
      )}
      {delegatesState.success && delegatesState.data && (
        <DelegatesCard initial={delegatesState.data} />
      )}
    </Shell>
  );
}
