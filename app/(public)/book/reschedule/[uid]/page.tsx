// app/(public)/book/reschedule/[uid]/page.tsx
//
// PUBLIC attendee self-service reschedule page (Universal Booking U5, D16) —
// the landing for the "Reschedule" link in the confirmation email. Auth = the
// booking's cancel_token as ?token= (one capability authorises the whole
// cancel/reschedule link family).
//
// Token is verified SERVER-SIDE before any booking detail renders; the
// static 'reschedule' segment outranks the sibling /book/[slug] route for
// nested paths (avoid a routing-config slug named "reschedule" regardless).
//
// Pattern: app/(public)/book/cancel/[uid]/page.tsx (token-gated server load
// → client widget).

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { RescheduleWidget } from './_components/reschedule-widget';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reschedule booking · JKKN',
  robots: { index: false },
};

interface ReschedulePageProps {
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ token?: string }>;
}

interface BookingView {
  meetingTitle: string;
  hostName: string;
  startTime: string;
  status: string;
}

async function loadBooking(uid: string, token: string): Promise<BookingView | null> {
  if (!uid || !token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: booking } = await supabase
    .from('meeting_bookings')
    .select('cancel_token, status, start_time, meeting_type_id, host_profile_id')
    .eq('uid', uid)
    .maybeSingle();
  // Token gate BEFORE any detail leaves the server.
  if (!booking || booking.cancel_token !== token) return null;

  const [{ data: mt }, { data: host }] = await Promise.all([
    supabase
      .from('meeting_types')
      .select('title')
      .eq('id', booking.meeting_type_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', booking.host_profile_id)
      .maybeSingle(),
  ]);

  return {
    meetingTitle: (mt?.title as string | undefined) ?? 'Meeting',
    hostName:
      (host?.full_name as string | undefined) ?? (host?.email as string | undefined) ?? 'Host',
    startTime: booking.start_time as string,
    status: booking.status as string,
  };
}

export default async function RescheduleBookingPage({ params, searchParams }: ReschedulePageProps) {
  const { uid } = await params;
  const { token } = await searchParams;
  const booking = await loadBooking(uid, token ?? '');

  const initialState = !booking
    ? ('invalid' as const)
    : booking.status !== 'confirmed'
      ? ('not-confirmed' as const)
      : ('pick' as const);

  return (
    <RescheduleWidget
      uid={uid}
      token={token ?? ''}
      initialState={initialState}
      meetingTitle={booking?.meetingTitle ?? ''}
      hostName={booking?.hostName ?? ''}
      currentStart={booking?.startTime ?? ''}
    />
  );
}
