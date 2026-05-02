// app/(routes)/meetings/[uid]/page.tsx
//
// F7 detail — single booking detail view, read-only.
//
// Hosted-by-you bookings sourced from jicate_booking_mirror (PR #648).
// RLS enforces that hosts only see their own rows; super_admin/director
// see all. Unauthorized access on a valid uid still returns notFound()
// because RLS filters at the row level.
//
// All mutations (cancel, reschedule, mark complete) deep-link out to
// jicate-booking — Cal.com is the source of truth.
//
// Spec: specs/jicate-booking-integration-f4-f7-spec.md §4.3
// Lock: jicate-booking-multi-tenant-90d clause A4 (verdict 2026-07-30)

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Mail,
  Phone,
  User,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

interface DetailPageProps {
  params: Promise<{ uid: string }>;
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  pending: 'secondary',
  rescheduled: 'secondary',
  completed: 'outline',
  no_show: 'outline',
  cancelled: 'destructive',
};

function formatBookingTime(iso: string, tz?: string | null): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: tz ?? 'Asia/Kolkata',
  }).format(new Date(iso));
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

export default async function MeetingDetailPage({ params }: DetailPageProps) {
  const { uid } = await params;
  const supabase = await createClient();

  // Use select('*') so Supabase returns the fully typed Row.
  // Long select strings degrade to GenericStringError on the typed client.
  const { data: booking, error } = await supabase
    .from('jicate_booking_mirror')
    .select('*')
    .eq('cal_booking_uid', uid)
    .maybeSingle();

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Meeting" description="Failed to load booking." />
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" aria-hidden />
            {error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!booking) {
    notFound();
  }

  const duration = durationMinutes(booking.start_time, booking.end_time);
  const externalBookingUrl = `https://jicate-booking.vercel.app/booking/${booking.cal_booking_uid}`;
  const externalRescheduleUrl = `${externalBookingUrl}?reschedule=true`;
  const externalCancelUrl = `${externalBookingUrl}?cancel=true`;
  const isCancelled = booking.status === 'cancelled';
  const isPast = booking.status === 'completed' || booking.status === 'no_show';

  return (
    <div className="space-y-4">
      <Link href="/meetings/inbox" className="inline-flex">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
          Back to inbox
        </Button>
      </Link>

      <PageHeader
        title={`Meeting with ${booking.attendee_name || booking.attendee_email}`}
        description={`Booking ${booking.cal_booking_uid}`}
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
            <span>{formatBookingTime(booking.start_time, booking.timezone)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>
              {duration} {duration === 1 ? 'minute' : 'minutes'}
              {booking.timezone ? ` · ${booking.timezone}` : ''}
            </span>
          </div>
          {booking.reschedule_uid ? (
            <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <strong>Rescheduled from:</strong>{' '}
              <Link
                href={`/meetings/${booking.reschedule_uid}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {booking.reschedule_uid}
              </Link>
            </div>
          ) : null}
          {booking.cancellation_reason ? (
            <div className="rounded-md bg-destructive/10 p-2 text-xs">
              <strong>Cancellation reason:</strong> {booking.cancellation_reason}
            </div>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Host</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>{booking.host_name || booking.host_email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>{booking.host_email}</span>
          </div>
        </CardContent>
      </Card>

      {!isCancelled && !isPast ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a
              href={externalRescheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Reschedule on jicate-booking
              </Button>
            </a>
            <a
              href={externalCancelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Cancel on jicate-booking
              </Button>
            </a>
            <a
              href={externalBookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button variant="ghost" size="sm">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Open booking page
              </Button>
            </a>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Booking last synced {new Date(booking.webhook_received_at).toLocaleString('en-IN')} ·{' '}
        Source of truth: jicate-booking
      </p>
    </div>
  );
}
