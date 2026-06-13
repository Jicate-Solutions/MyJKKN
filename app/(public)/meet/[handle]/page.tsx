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
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  PublicHostService,
  type PublicHost,
} from '@/lib/services/meetings/public-host-service';
import { MeetBookingWidget } from './_components/meet-booking-widget';

export const dynamic = 'force-dynamic';

interface MeetPageProps {
  params: Promise<{ handle: string }>;
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
  const host = await loadHost(handle);
  if (!host || host.meetingTypes.length === 0) notFound();

  return (
    <MeetBookingWidget
      handle={host.handle}
      name={host.name}
      designation={host.designation}
      departmentName={host.departmentName}
      institutionName={host.institutionName}
      headline={host.headline}
      avatarUrl={host.avatarUrl}
      meetingTypes={host.meetingTypes}
    />
  );
}
