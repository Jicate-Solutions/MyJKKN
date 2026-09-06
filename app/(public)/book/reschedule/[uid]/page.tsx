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

import type { Metadata, Viewport } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  isSwitchAllowedNow,
  switchRequestState,
  switchSourceMode,
} from '@/lib/services/meetings/meeting-mode-switch';
import { RescheduleWidget } from './_components/reschedule-widget';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reschedule booking · JKKN',
  robots: { index: false },
};

// Opened in a mobile browser from a calendar invite, so the browser chrome is
// part of the page: themeColor tints Safari's bars to the same evergreen the
// PWA uses (app/manifest.ts), and colorScheme makes the UA paint its own canvas
// to match instead of leaving white behind a dark page. Matches the pattern in
// app/(parent-portal)/layout.tsx.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b6d41' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1411' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
  /** In-person and still far enough out to ask for a video call instead. */
  canAskForVideo: boolean;
  /** A request is already in, still inside the notice window, awaiting the host. */
  switchRequestPending: boolean;
}

async function loadBooking(uid: string, token: string): Promise<BookingView | null> {
  if (!uid || !token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: booking } = await supabase
    .from('meeting_bookings')
    // One string literal, never a concatenation: supabase-js infers the row
    // type from the literal, and a runtime-built string collapses it to
    // GenericStringError, taking every field access down with it.
    .select('cancel_token, status, start_time, meeting_type_id, host_profile_id, location_mode_override, mode_switch_request_status')
    .eq('uid', uid)
    .maybeSingle();
  // Token gate BEFORE any detail leaves the server.
  if (!booking || booking.cancel_token !== token) return null;

  const [{ data: mt }, { data: host }] = await Promise.all([
    supabase
      .from('meeting_types')
      .select('title, location_mode, min_notice_min')
      .eq('id', booking.meeting_type_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', booking.host_profile_id)
      .maybeSingle(),
  ]);

  // Whether asking to switch is even offered. Deliberately NOT a check of the
  // host's Google connection: that is a live third-party lookup the route
  // already performs, and duplicating it here would slow every page load to
  // pre-empt a case the route already names properly (calendar_not_connected).
  const minNotice = mt?.min_notice_min as number | null | undefined;
  const source = switchSourceMode(
    mt?.location_mode as string | undefined,
    booking.location_mode_override as string | null,
  );
  const canAskForVideo =
    booking.status === 'confirmed' &&
    // 'switchable' is in-person OR phone since ruling 1 (2026-08-21). It read
    // 'in_person' before that; leaving it would have hidden the ask from
    // everyone, because switchSourceMode no longer returns that value.
    source === 'switchable' &&
    isSwitchAllowedNow(booking.start_time as string, minNotice);

  return {
    meetingTitle: (mt?.title as string | undefined) ?? 'Meeting',
    hostName:
      (host?.full_name as string | undefined) ?? (host?.email as string | undefined) ?? 'Host',
    startTime: booking.start_time as string,
    status: booking.status as string,
    canAskForVideo,
    // An expired request reads as declined (decision B) — showing "waiting for
    // the host" for one would be a promise nobody is going to keep.
    switchRequestPending: switchRequestState(booking, minNotice) === 'pending',
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
      canAskForVideo={booking?.canAskForVideo ?? false}
      switchRequestPending={booking?.switchRequestPending ?? false}
    />
  );
}
