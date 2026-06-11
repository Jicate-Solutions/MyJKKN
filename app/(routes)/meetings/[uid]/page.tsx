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
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { CancelBookingButton } from './_components/cancel-booking-button';

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

  // meeting type title (nullable — type may have been soft-deleted)
  const { data: meetingType } = booking.meeting_type_id
    ? await supabase
        .from('meeting_types')
        .select('title, duration_min')
        .eq('id', booking.meeting_type_id)
        .maybeSingle()
    : { data: null };

  const duration = durationMinutes(booking.start_time, booking.end_time);
  const isCancelled = booking.status === 'cancelled';
  const isPast =
    booking.status === 'completed' ||
    booking.status === 'no_show' ||
    new Date(booking.end_time).getTime() < Date.now();

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

        {!isCancelled && !isPast ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <CancelBookingButton uid={booking.uid} />
              <p className="mt-2 text-xs text-muted-foreground">
                To reschedule, cancel this booking and share your booking link again.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          Source of truth: MyJKKN native scheduling
          {booking.source === 'ported-from-cal' ? ' (ported from Cal.com)' : ''}
        </p>
      </div>
    </ContentLayout>
  );
}
