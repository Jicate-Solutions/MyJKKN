// app/(routes)/meetings/my-bookings/page.tsx
//
// "My Meetings" — every native booking the signed-in person is IN, hosting or
// attending, in one list, with cancel and reschedule one tap away.
//
// WHY THIS EXISTS
//   The Director's Google Calendar invites carry Cancel/Reschedule links to
//   www.jkkn.ai/book/... . On an iPhone those always open a browser, never the
//   installed PWA — a home-screen web app cannot capture https links from
//   other apps without a native app and Universal Links, which this repo does
//   not have. Rather than fight the link, this page puts the same controls
//   inside MyJKKN, so the calendar link is never needed.
//
// WHY IT IS NOT /meetings/inbox
//   The inbox is "bookings hosted by you" and reads through the session
//   client, so mb_host_select (host-only) bounds it. Meetings you are
//   ATTENDING have never been visible anywhere in this module. This page is
//   the union of both sides — see lib/services/meetings/my-bookings-query.ts
//   for the policy text and the reasoning.
//
// Cancel and reschedule are NOT reimplemented here: hosting rows link to
// /meetings/[uid], which already has working controls
// (_components/cancel-booking-button.tsx, _components/reschedule-booking-button.tsx).
// Attending rows do not link there, because that page reads under RLS and
// would answer an attendee with notFound().

import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  Info,
  LogIn,
  Mail,
  Video,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  MY_BOOKING_FILTERS,
  canOpenDetail,
  isAwaitingOutcome,
  resolveFilter,
} from '@/lib/services/meetings/my-bookings-query';

import { listMyBookings, type MyBookingRow, type MyBookingsFailure } from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  completed: 'outline',
  no_show: 'outline',
  cancelled: 'destructive',
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

/** Who the meeting is WITH, from the viewer's side of it. */
function counterpartyLabel(row: MyBookingRow): string {
  if (row.role === 'host') {
    return row.attendee_name || row.attendee_email || 'Guest';
  }
  return row.hostName || row.hostEmail || 'Host';
}

function BookingCardBody({ row }: { row: MyBookingRow }) {
  const minutes = durationMinutes(row.start_time, row.end_time);
  const openable = canOpenDetail(row.role);

  return (
    <CardContent className="space-y-2 p-4">
      {/* Row 1 wraps rather than truncating: on a 390px screen the status and
          the name cannot share a line, and the name is the part that matters. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? 'outline'}>{row.status}</Badge>
        <Badge variant="secondary" className="font-normal">
          {row.role === 'host' ? 'You host' : 'You attend'}
        </Badge>
        {isAwaitingOutcome(row) ? (
          <Badge variant="outline" className="border-amber-400 text-amber-700">
            Not marked
          </Badge>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{counterpartyLabel(row)}</p>
        {row.typeTitle ? (
          <p className="truncate text-xs text-muted-foreground">{row.typeTitle}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
          {formatWhen(row.start_time)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          {minutes} min
        </span>
      </div>

      {/* Controls. A hosting row hands off to the detail page, which already
          owns cancel and reschedule. An attending row gets what it can act on
          — the join link and a way to reach the host — plus the plain truth
          about who can move the meeting. */}
      {openable ? (
        <div className="pt-1">
          <Link href={`/meetings/${row.uid}`} className="block">
            <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto">
              Open, cancel or reschedule
              <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <div className="flex flex-col gap-2 sm:flex-row">
            {row.video_url ? (
              <a href={row.video_url} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto">
                  <Video className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Join
                </Button>
              </a>
            ) : null}
            {row.hostEmail ? (
              <a href={`mailto:${row.hostEmail}`} className="block">
                <Button variant="ghost" size="sm" className="w-full justify-center sm:w-auto">
                  <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Email the host
                </Button>
              </a>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Only the host can move or cancel this meeting.
          </p>
        </div>
      )}
    </CardContent>
  );
}

export default async function MyBookingsPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams;
  const filter = resolveFilter(statusParam);
  const result = await listMyBookings(filter.key);

  const breadcrumb = (
    <PageBreadcrumb
      items={[
        { label: 'Home', href: '/' },
        { label: 'Meetings', href: '/meetings/inbox' },
        { label: 'My Meetings' },
      ]}
    />
  );

  // Rule #27: say what happened. Never bounce a signed-out or blocked person
  // to /dashboard — that is a loop they cannot diagnose.
  if (!result.ok) {
    // strictNullChecks is off repo-wide, so `!result.ok` does NOT narrow the
    // union — the alias is what makes the failure fields readable.
    const failure = result as MyBookingsFailure;
    const signedOut = failure.reason === 'signed-out';
    return (
      <ContentLayout title="My Meetings">
        {breadcrumb}
        <div className="mt-4 space-y-4">
          <PageHeader title="My Meetings" description="Meetings you are hosting or attending." />
          <Card className="border-destructive/40">
            <CardContent className="space-y-3 py-10 text-center">
              {signedOut ? (
                <LogIn className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              ) : (
                <Info className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              )}
              <div>
                <h3 className="text-sm font-medium">
                  {signedOut ? 'You are signed out' : 'Could not load your meetings'}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  {failure.message}
                </p>
              </div>
              {signedOut ? (
                <Link href="/auth/login" className="inline-flex">
                  <Button size="sm">Sign in</Button>
                </Link>
              ) : (
                <Link href="/meetings/my-bookings" className="inline-flex">
                  <Button variant="outline" size="sm">
                    Try again
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const rows = result.rows;

  return (
    <ContentLayout title="My Meetings">
      {breadcrumb}
      <div className="mt-4 space-y-4">
        <PageHeader
          title="My Meetings"
          description="Every meeting you are in — the ones you host and the ones you were booked into. Cancel or move any meeting you host without leaving the app."
        />

        {/* Horizontal scroll rather than wrap: four filters wrap to two rows at
            390px and push the first meeting below the fold. */}
        <nav aria-label="Filter meetings" className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max gap-2">
            {MY_BOOKING_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={
                  f.key === 'upcoming'
                    ? '/meetings/my-bookings'
                    : `/meetings/my-bookings?status=${f.key}`
                }
                className="inline-flex"
              >
                <Button variant={filter.key === f.key ? 'default' : 'outline'} size="sm">
                  {f.label}
                </Button>
              </Link>
            ))}
          </div>
        </nav>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <h3 className="mt-3 text-sm font-medium">
                No {filter.label.toLowerCase()} meetings
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {filter.key === 'upcoming'
                  ? 'Nothing is scheduled. Meetings appear here as soon as someone books you or you are added to one.'
                  : `Nothing matches the "${filter.label}" filter.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <Card key={row.id} className="overflow-hidden">
                <BookingCardBody row={row} />
              </Card>
            ))}
          </div>
        )}

        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Looking for the bookings people made with you, with the awaiting-you queue?
            </p>
            <Link href="/meetings/inbox" className="inline-flex">
              <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto">
                Open the inbox
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
