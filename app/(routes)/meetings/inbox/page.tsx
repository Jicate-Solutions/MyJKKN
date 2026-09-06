// app/(routes)/meetings/inbox/page.tsx
//
// F7 — /meetings/inbox surface for jicate-booking integration.
//
// Read-only inbox of bookings hosted by the current MyJKKN user, sourced
// from the jicate_booking_mirror table (PR #648). Refreshed asynchronously
// by the F4 webhook receiver (PR #649) — the mirror is eventually-consistent.
//
// RLS handles auth at the row level (host_user_id = auth.uid() OR caller is
// super_admin/director). This page does NO additional role gating — any
// authenticated user with at least one mirror row sees their own meetings;
// users with zero rows see the empty state.
//
// Detail / cancel / reschedule actions deep-link to jicate-booking
// (https://jicate-booking.vercel.app) — Cal.com remains the source of truth.
//
// Spec: specs/jicate-booking-integration-f4-f7-spec.md §4.2
// Lock: jicate-booking-multi-tenant-90d clause A4 (verdict 2026-07-30)

import Link from 'next/link';
import { ArrowUpRight, Calendar, Clock, User } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

interface InboxPageProps {
  searchParams: Promise<{ status?: string }>;
}

// Upcoming/Past are TIME questions, not status questions. Nothing ever
// transitions a booking to 'completed', so a meeting held in June is still
// 'confirmed' — filtering these two tabs on status alone listed every past
// booking under "Upcoming" and left "Past" permanently empty (production:
// 31 confirmed, of which 24 were already in the past; zero rows have ever
// held 'completed' or 'no_show'). Both tabs now carry a start_time predicate.
// 'pending'/'rescheduled' are dropped from the match list because
// meeting_bookings_status_check permits only confirmed/cancelled/completed/
// no_show — they could never match anything.
// 'awaiting' (2026-08-21) is what replaced the 7-day auto-close. Its predicate
// is deliberately IDENTICAL to the sweep the cron used to run — confirmed and
// already started — so the meetings a machine used to quietly stamp
// 'completed' are now the meetings a host is asked about. It sits first
// because it is the only tab that asks the host to DO something.
const STATUS_FILTERS = [
  { key: 'awaiting', label: 'Awaiting you', match: ['confirmed'], when: 'past' },
  { key: 'upcoming', label: 'Upcoming', match: ['confirmed'], when: 'future' },
  { key: 'past', label: 'Past', match: ['confirmed', 'completed', 'no_show'], when: 'past' },
  { key: 'cancelled', label: 'Cancelled', match: ['cancelled'], when: null },
  { key: 'all', label: 'All', match: null, when: null },
] as const;

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  pending: 'secondary',
  rescheduled: 'secondary',
  completed: 'outline',
  no_show: 'outline',
  cancelled: 'destructive',
};

function formatBookingTime(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz ?? 'Asia/Kolkata',
  }).format(d);
}

export default async function MeetingsInboxPage({ searchParams }: InboxPageProps) {
  const { status: statusParam } = await searchParams;
  const filterKey = (STATUS_FILTERS.find((f) => f.key === statusParam)?.key ?? 'upcoming') as
    | 'awaiting'
    | 'upcoming'
    | 'past'
    | 'cancelled'
    | 'all';
  const filter = STATUS_FILTERS.find((f) => f.key === filterKey)!;

  // Phase N2: bookings now live in the NATIVE meeting_bookings table (the
  // in-house engine, migration 20260611190000) — not the Cal.com webhook
  // mirror. RLS (mb_host_select) scopes rows to host_profile_id = auth.uid().
  // The table isn't in generated types yet → untyped client (TS2589 class).
  const supabase = (await createClient()) as unknown as import('@supabase/supabase-js').SupabaseClient;

  let query = supabase
    .from('meeting_bookings')
    .select('*')
    .order('start_time', { ascending: filterKey === 'upcoming' });

  if (filter.match) {
    query = query.in('status', filter.match as unknown as string[]);
  }

  if (filter.when) {
    const nowIso = new Date().toISOString();
    query =
      filter.when === 'future'
        ? query.gte('start_time', nowIso)
        : query.lt('start_time', nowIso);
  }

  const { data: rows, error } = await query.limit(50);

  // Counted on every tab, not just its own: a host who never opens "Awaiting
  // you" would otherwise never learn the pile exists — which is the exact
  // failure mode of the cron this replaced. RLS scopes it to the caller's own
  // meetings, so this is the host's number and nobody else's.
  const { count: awaitingCount } = await supabase
    .from('meeting_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .lt('start_time', new Date().toISOString());

  return (
    <ContentLayout title="My Meetings">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Inbox' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="My Meetings"
          description="Bookings hosted by you — managed entirely inside MyJKKN."
        />

      {filterKey === 'awaiting' ? (
        <p className="text-xs text-muted-foreground">
          These meetings have ended and nobody has said what happened. Open one to mark it
          held or not held, or to move it to a new time. Until 21 August they were recorded
          as completed automatically after seven days, whether or not anyone met.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'upcoming' ? '/meetings/inbox' : `/meetings/inbox?status=${f.key}`}
            className="inline-flex"
          >
            <Button variant={filterKey === f.key ? 'default' : 'outline'} size="sm">
              {f.label}
              {f.key === 'awaiting' && (awaitingCount ?? 0) > 0 ? (
                <Badge
                  variant={filterKey === f.key ? 'secondary' : 'default'}
                  className="ml-1.5 px-1.5 py-0 text-[11px] tabular-nums"
                >
                  {awaitingCount}
                </Badge>
              ) : null}
            </Button>
          </Link>
        ))}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Failed to load meetings: {error.message}
          </CardContent>
        </Card>
      ) : !rows || rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
            <h3 className="mt-3 text-sm font-medium">
              {filterKey === 'awaiting' ? 'Nothing awaiting you' : `No ${filter.label.toLowerCase()} meetings`}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {filterKey === 'upcoming'
                ? "You don't have any upcoming bookings yet. They'll appear here once someone books a slot."
                : filterKey === 'awaiting'
                  ? 'Nothing is waiting on you. Meetings that have ended without you saying what happened show up here.'
                  : `No bookings match the "${filter.label}" filter.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/meetings/${row.uid}`}
              className="block focus:outline-none"
            >
              <Card className="transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? 'outline'}>
                        {row.status}
                      </Badge>
                      {/* A finished booking still sitting at 'confirmed' is one
                          nobody has said happened. Flagging it here is what
                          sends the host into the detail page to answer — the
                          buttons themselves live there, next to the RPC. */}
                      {row.status === 'confirmed' &&
                      new Date(row.start_time).getTime() < Date.now() ? (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          Not marked
                        </Badge>
                      ) : null}
                      <span className="truncate text-sm font-medium">
                        {row.attendee_name || row.attendee_email}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden />
                        {formatBookingTime(row.start_time)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" aria-hidden />
                        {row.attendee_email}
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="text-xs text-muted-foreground">
            Set up your bookable event types and availability — both live inside MyJKKN now.
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/meetings/manage" className="inline-flex">
              <Button variant="outline" size="sm">
                <Calendar className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Manage event types
              </Button>
            </Link>
            <Link href="/meetings/availability" className="inline-flex">
              <Button variant="outline" size="sm">
                <Clock className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Set availability
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </ContentLayout>
  );
}
