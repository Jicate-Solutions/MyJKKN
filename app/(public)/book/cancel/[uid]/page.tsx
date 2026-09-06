// app/(public)/book/cancel/[uid]/page.tsx
//
// PUBLIC attendee self-service cancel page (Phase N3a) — the landing for the
// "Cancel Booking" link in the confirmation email. Auth = the booking's
// cancel_token passed as ?token= (DB-generated uuid, only ever sent to the
// attendee's inbox; designed for exactly this in 20260611190000).
//
// Token is verified SERVER-SIDE before any booking detail is rendered — a
// bare /book/cancel/<uid> without the right token shows a generic error.
// The static "cancel" segment wins over the sibling dynamic /book/[slug]
// route for nested paths, so this cannot be shadowed by a routing config
// (avoid naming a routing-config slug "cancel" regardless).
//
// Pattern: app/(public)/book/[slug]/page.tsx (service-role load, no auth).

import type { Metadata, Viewport } from 'next';
import { createClient } from '@supabase/supabase-js';
import { CancelWidget } from './_components/cancel-widget';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cancel booking · JKKN',
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

interface CancelPageProps {
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ token?: string }>;
}

interface BookingView {
  meetingTitle: string;
  hostName: string;
  startTime: string;
  status: string;
  /** Wave-3 lifecycle: free-text policy shown to the attendee on this page. */
  cancellationPolicy: string | null;
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
      // cancellation_policy isn't in generated types yet — select by name; the
      // service-role read returns it whether or not the column exists in types.
      .select('title, cancellation_policy')
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
    cancellationPolicy:
      ((mt as { cancellation_policy?: string | null } | null)?.cancellation_policy ?? null) || null,
  };
}

export default async function CancelBookingPage({ params, searchParams }: CancelPageProps) {
  const { uid } = await params;
  const { token } = await searchParams;
  const booking = await loadBooking(uid, token ?? '');

  const initialState = !booking
    ? ('invalid' as const)
    : booking.status === 'cancelled'
      ? ('already-cancelled' as const)
      : booking.status !== 'confirmed'
        ? ('invalid' as const)
        : new Date(booking.startTime).getTime() < Date.now()
          ? ('past' as const)
          : ('confirm' as const);

  return (
    <CancelWidget
      uid={uid}
      token={token ?? ''}
      initialState={initialState}
      meetingTitle={booking?.meetingTitle ?? ''}
      hostName={booking?.hostName ?? ''}
      startTime={booking?.startTime ?? ''}
      cancellationPolicy={booking?.cancellationPolicy ?? null}
    />
  );
}
