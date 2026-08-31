// app/(public)/meet/[handle]/page.tsx
//
// PUBLIC personal booking page (Universal Booking U4) — the /meet/<handle>
// URL shape the engine's schema comments always pointed at. Visitor picks one
// of the host's meeting types, a live slot, fills details → instant confirm
// (D2). Emails + Google event + Meet link all happen inside createBooking.
//
// D20 gate: PublicHostService.resolveBookableHost returns null for anything
// not bookable (unknown handle / private / auto-hidden / no active Google
// connection) — all render the same 404 (no oracle).
//
// Pattern: app/(public)/book/[slug]/page.tsx (server load → client widget).

import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { resolveRetiredHandle } from '@/lib/services/meetings/handle-redirect';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  PublicHostService,
  type PublicHost,
} from '@/lib/services/meetings/public-host-service';
import { BookingTrackingScripts } from '@/lib/services/analytics/booking-pixel-service';
import { MeetBookingWidget } from './_components/meet-booking-widget';
import { NotBookable } from './_components/not-bookable';

export const dynamic = 'force-dynamic';

interface MeetPageProps {
  params: Promise<{ handle: string }>;
}

/** Signed-in viewer (if any) so the widget can skip the email step and book
 *  them as themselves. null = anonymous visitor off the public internet. */
async function loadViewer(): Promise<{ name: string; email: string } | null> {
  try {
    const ssr = await createServerClient();
    const {
      data: { user },
    } = await ssr.auth.getUser();
    if (!user?.id) return null;
    const { data: profile } = await ssr
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    return {
      name: (profile?.full_name as string | undefined) ?? user.email ?? 'JKKN User',
      email: (profile?.email as string | undefined) ?? user.email ?? '',
    };
  } catch {
    return null; // a bad/absent cookie is normal here — treat as anonymous
  }
}

async function loadHost(handle: string): Promise<PublicHost | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return PublicHostService.resolveBookableHost(supabase, handle);
}

export async function generateMetadata({ params }: MeetPageProps): Promise<Metadata> {
  const { handle } = await params;
  const host = await loadHost(handle);
  return {
    title: host ? `${host.name} · Book a meeting · JKKN` : 'Book a meeting · JKKN',
    robots: { index: false },
  };
}

export default async function MeetPersonPage({ params }: MeetPageProps) {
  const { handle } = await params;
  const [host, viewer] = await Promise.all([loadHost(handle), loadViewer()]);

  // Before 404ing: was this an address an admin retired? A published page's
  // handle is admin-only to change precisely because the link may already be
  // shared, so a rename must forward rather than break every saved link.
  // 308 (permanentRedirect) so browsers and crawlers update the address, and so
  // the method is preserved — a plain 302 would be re-followed on every visit.
  if (!host) {
    const current = await resolveRetiredHandle(handle);
    if (current) permanentRedirect(`/meet/${current}`);
    // Unknown / private / auto-hidden / no-active-Google → genuine 404.
    notFound();
  }
  // Real, bookable host who simply has no meeting types yet → explicit "not
  // ready" state instead of a confusing raw 404 (BUG-004267). The host testing
  // their own freshly-generated link gets a clear next step.
  if (host.meetingTypes.length === 0) {
    return <NotBookable handle={host.handle} name={host.name} />;
  }

  return (
    <>
      {/* GA4 + Meta Pixel base scripts — env-gated, self-disables when ids unset. */}
      <BookingTrackingScripts />
      <MeetBookingWidget
        handle={host.handle}
        name={host.name}
        designation={host.designation}
        departmentName={host.departmentName}
        institutionName={host.institutionName}
        headline={host.headline}
        avatarUrl={host.avatarUrl}
        meetingTypes={host.meetingTypes}
        viewer={viewer}
        // The host's own routing form, when they have an active one — the only
        // place anything links to it. null for every host without one, and the
        // page then renders exactly as it did before.
        routingForm={host.routingForm}
      />
    </>
  );
}
