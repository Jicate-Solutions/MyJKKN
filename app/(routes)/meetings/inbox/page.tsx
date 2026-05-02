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
import { ArrowUpRight, Calendar, ExternalLink, User } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

interface InboxPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_FILTERS = [
  { key: 'upcoming', label: 'Upcoming', match: ['confirmed', 'pending', 'rescheduled'] },
  { key: 'past', label: 'Past', match: ['completed', 'no_show'] },
  { key: 'cancelled', label: 'Cancelled', match: ['cancelled'] },
  { key: 'all', label: 'All', match: null },
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
    | 'upcoming'
    | 'past'
    | 'cancelled'
    | 'all';
  const filter = STATUS_FILTERS.find((f) => f.key === filterKey)!;

  const supabase = await createClient();

  let query = supabase
    .from('jicate_booking_mirror')
    .select(
      'id, cal_booking_uid, status, start_time, end_time, timezone, attendee_email, attendee_name, host_email, host_name, webhook_event',
    )
    .order('start_time', { ascending: filterKey === 'upcoming' });

  if (filter.match) {
    query = query.in('status', filter.match as unknown as string[]);
  }

  const { data: rows, error } = await query.limit(50);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Meetings"
        description="Bookings hosted by you on jicate-booking. Source of truth lives on Cal.com — actions open the booking page there."
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'upcoming' ? '/meetings/inbox' : `/meetings/inbox?status=${f.key}`}
            className="inline-flex"
          >
            <Button variant={filterKey === f.key ? 'default' : 'outline'} size="sm">
              {f.label}
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
            <h3 className="mt-3 text-sm font-medium">No {filter.label.toLowerCase()} meetings</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {filterKey === 'upcoming'
                ? "You don't have any upcoming bookings yet. They'll appear here once someone books a slot."
                : `No bookings match the "${filter.label}" filter.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/meetings/${row.cal_booking_uid}`}
              className="block focus:outline-none"
            >
              <Card className="transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? 'outline'}>
                        {row.status}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {row.attendee_name || row.attendee_email}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden />
                        {formatBookingTime(row.start_time, row.timezone)}
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
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="text-xs text-muted-foreground">
            To create or modify your availability, manage event types on jicate-booking directly.
          </div>
          <a
            href="https://jicate-booking.vercel.app/event-types"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Manage on jicate-booking
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
