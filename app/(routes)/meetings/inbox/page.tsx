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
  searchParams: Promise<{ status?: string; type?: string }>;
}

// ?type= narrows the list to one meeting type (meeting_bookings.meeting_type_id),
// or to meetings with no type ('none': meetings a host scheduled directly).
// Anything that is neither a uuid nor 'none' is ignored rather than erroring.
const NO_TYPE = 'none';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The inbox link for a status tab and type, dropping the defaults. */
function inboxHref(status: string, type: string | null): string {
  const params = new URLSearchParams();
  if (status !== 'upcoming') params.set('status', status);
  if (type) params.set('type', type);
  const qs = params.toString();
  return qs ? `/meetings/inbox?${qs}` : '/meetings/inbox';
}

// Upcoming/Past are TIME questions, not status questions. A booking becomes
// 'completed' only when a person marks it, or (since 20271003091700) when the
// daily sweep closes it 7 days after it ends because its notes are linked, so
// a meeting held in June can still be 'confirmed' — filtering these two tabs
// on status alone listed every past booking under "Upcoming" and left "Past"
// permanently empty (production:
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
  const { status: statusParam, type: typeParam } = await searchParams;
  const typeFilter =
    typeParam === NO_TYPE || (typeParam && UUID_RE.test(typeParam)) ? typeParam : null;
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

  // The status tab's own predicate, shared by the list and the type counts so a
  // chip's number is exactly what clicking it shows under the current tab.
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withStatus = (q: any) => {
    let out = q;
    if (filter.match) out = out.in('status', filter.match as unknown as string[]);
    if (filter.when) out = filter.when === 'future' ? out.gte('start_time', nowIso) : out.lt('start_time', nowIso);
    return out;
  };

  let query = withStatus(
    supabase.from('meeting_bookings').select('*').order('start_time', { ascending: filterKey === 'upcoming' })
  );
  if (typeFilter === NO_TYPE) query = query.is('meeting_type_id', null);
  else if (typeFilter) query = query.eq('meeting_type_id', typeFilter);

  const { data: rows, error } = await query.limit(50);

  // Type chips: every meeting type that has at least one booking under the
  // current tab, with its count. Read through the same session client, so RLS
  // limits it to exactly the bookings this person can already see.
  const { data: typeRows } = await withStatus(
    supabase.from('meeting_bookings').select('meeting_type_id')
  ).limit(5000);
  const typeCounts = new Map<string | null, number>();
  for (const r of (typeRows ?? []) as { meeting_type_id: string | null }[]) {
    typeCounts.set(r.meeting_type_id, (typeCounts.get(r.meeting_type_id) ?? 0) + 1);
  }
  const typeIds = [...typeCounts.keys()].filter((id): id is string => Boolean(id));
  if (typeFilter && typeFilter !== NO_TYPE && !typeIds.includes(typeFilter)) typeIds.push(typeFilter);
  const { data: typeNames } = typeIds.length
    ? await supabase.from('meeting_types').select('id, title').in('id', typeIds)
    : { data: [] as { id: string; title: string }[] };
  const typeTitle = new Map(((typeNames ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]));
  const typeChips = [
    ...typeIds
      .filter((id) => (typeCounts.get(id) ?? 0) > 0)
      .map((id) => ({ key: id, label: typeTitle.get(id) ?? 'Meeting type', count: typeCounts.get(id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    ...((typeCounts.get(null) ?? 0) > 0
      ? [{ key: NO_TYPE, label: 'Scheduled directly (no type)', count: typeCounts.get(null) ?? 0 }]
      : []),
  ];
  const activeTypeLabel =
    typeFilter === NO_TYPE ? 'Scheduled directly (no type)' : typeFilter ? typeTitle.get(typeFilter) ?? 'this type' : null;

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
          held or not held, or to move it to a new time. A meeting whose notes are linked
          closes on its own 7 days after it ends, and its page then says it was closed
          automatically because the notes were linked. Every other meeting stays here until
          a person marks it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={inboxHref(f.key, typeFilter)}
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

      {typeChips.length > 0 || typeFilter ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Meeting type</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by meeting type">
            <Link href={inboxHref(filterKey, null)} className="inline-flex">
              <Button variant={typeFilter ? 'outline' : 'secondary'} size="sm" aria-pressed={!typeFilter}>
                All types
              </Button>
            </Link>
            {typeChips.map((t) => (
              <Link key={t.key} href={inboxHref(filterKey, t.key)} className="inline-flex max-w-full">
                <Button
                  variant={typeFilter === t.key ? 'secondary' : 'outline'}
                  size="sm"
                  aria-pressed={typeFilter === t.key}
                  className="max-w-full"
                >
                  <span className="truncate">{t.label}</span>
                  <span className="ml-1.5 tabular-nums text-muted-foreground">{t.count}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

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
              {activeTypeLabel ? ` of type "${activeTypeLabel}"` : ''}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeTypeLabel
                ? 'Choose "All types" to see every meeting under this tab.'
                : filterKey === 'upcoming'
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
                      <span className="truncate">
                        {row.meeting_type_id
                          ? typeTitle.get(row.meeting_type_id) ?? 'Meeting type'
                          : 'Scheduled directly'}
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
