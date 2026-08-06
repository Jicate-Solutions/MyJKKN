// app/(public)/meet/[handle]/[type]/page.tsx
//
// PUBLIC direct link to ONE meeting type — /meet/<handle>/<type-slug>.
//
// WHY THIS EXISTS
//   /meet/<handle> shows every live meeting type and asks the visitor to pick.
//   That is the right front door, but it is the wrong thing to paste into an
//   email that says "book my 15-minute slot". Hosts carry many types — one had
//   49 on 2026-08-04 — so "pick the right one from this list" pushes the host's
//   filing problem onto the guest.
//
//   Every meeting type already carries a `slug`, and every row in production has
//   one (207 of 207 on 2026-08-04). The column was there; only the route was
//   missing. This is that route, and it adds no new data model.
//
// IT REUSES THE SAME WIDGET
//   MeetBookingWidget already takes a meetingTypes array, so a single-type page
//   is the same widget handed exactly one option. No widget changes, no second
//   booking path to keep in sync, and no chance of the two pages disagreeing
//   about availability, buffers or confirmation.
//
// 404 BEHAVIOUR MATCHES THE PARENT (D20, "no oracle")
//   Unknown handle, private page, auto-hidden, no active Google connection, and
//   now also unknown/hidden/inactive type all render the same notFound(). A
//   stranger must not be able to tell an inactive meeting type from one that
//   never existed — otherwise this URL becomes a way to enumerate a host's
//   private or draft types by guessing slugs.

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
import { MeetBookingWidget } from '../_components/meet-booking-widget';

export const dynamic = 'force-dynamic';

interface MeetTypePageProps {
  params: Promise<{ handle: string; type: string }>;
}

/** Signed-in viewer (if any) so the widget can skip the email step and book them
 *  as themselves. null = anonymous visitor off the public internet.
 *  Same shape as the parent page — a bad or absent cookie is normal here. */
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
    return null;
  }
}

async function loadHost(handle: string): Promise<PublicHost | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return PublicHostService.resolveBookableHost(supabase, handle);
}

/** resolveBookableHost already filters to live, visible types, so matching
 *  within its result means a hidden or inactive type can never resolve here. */
function findType(host: PublicHost, slug: string) {
  const wanted = slug.toLowerCase();
  return host.meetingTypes.find((t) => t.slug?.toLowerCase() === wanted) ?? null;
}

export async function generateMetadata({ params }: MeetTypePageProps): Promise<Metadata> {
  const { handle, type } = await params;
  const host = await loadHost(handle);
  const meetingType = host ? findType(host, type) : null;

  if (!host || !meetingType) {
    return { title: 'Book a meeting · JKKN', robots: { index: false } };
  }
  return {
    // "Classroom Visits (30 min) with Ommsharravana S" — the title is the thing
    // a guest sees in their tab and in link previews, so it leads with what they
    // are booking rather than with the platform.
    title: `${meetingType.title} (${meetingType.durationMin} min) with ${host.name} · JKKN`,
    description:
      meetingType.description ??
      `Book a ${meetingType.durationMin}-minute ${meetingType.title} with ${host.name}.`,
    robots: { index: false },
  };
}

export default async function MeetTypePage({ params }: MeetTypePageProps) {
  const { handle, type } = await params;
  const [host, viewer] = await Promise.all([loadHost(handle), loadViewer()]);

  // Same retired-address forward the parent page does — carrying the type slug
  // through, so /meet/<old>/<type> lands on /meet/<new>/<type> rather than the
  // host's index.
  //
  // This route shipped (#2816) before the rename feature existed (#2818), so for
  // a day the parent forwarded and this one 404'd. Nobody hit it — no handle has
  // been retired yet — but the first rename would have quietly broken exactly
  // the links most worth sharing: the ones naming a specific meeting.
  if (!host) {
    const current = await resolveRetiredHandle(handle);
    if (current) permanentRedirect(`/meet/${current}/${encodeURIComponent(type)}`);
    notFound();
  }

  const meetingType = findType(host, type);
  // Deliberately the same 404 as an unknown handle — see the "no oracle" note
  // at the top. Do not soften this into a "that meeting type is unavailable"
  // message: that would confirm the slug exists.
  if (!meetingType) notFound();

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
        // The whole point: one option, so the guest lands straight on the
        // calendar for the meeting the link promised.
        meetingTypes={[meetingType]}
        viewer={viewer}
      />
    </>
  );
}
