// app/(public)/embed/[handle]/page.tsx
//
// Universal Booking M7 — PUBLIC EMBEDDABLE booking page (Calendly's "embed
// Calendly on a website"). Same booking flow as /meet/<handle>, but rendered
// IFRAME-FRIENDLY: no app chrome, no full-screen background band, compact —
// so it drops cleanly into a host's external website via:
//   <iframe src="https://www.jkkn.ai/embed/<handle>"></iframe>
//
// READ PATH IS MIRRORED, NOT FORKED: it reuses the SAME service-role
// PublicHostService.resolveBookableHost() the /meet page uses (the D20 gate
// stays the single source of truth), then layers the host's brand color via
// the additive readThemeColor() read. Booking itself reuses the EXISTING
// public APIs (/api/public/meet/<handle>/<typeSlug>/slots + /book) — this page
// edits neither the read service nor the booking API.
//
// Pattern: app/(public)/meet/[handle]/page.tsx (server load → client widget).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { PublicHostService } from '@/lib/services/meetings/public-host-service';
import {
  readThemeColor,
  DEFAULT_THEME_COLOR,
} from '@/lib/services/meetings/meeting-embed-service';
import { EmbedBookingWidget } from './_components/embed-booking-widget';

// Per-host, mutable bookability + theme — never statically cache.
export const dynamic = 'force-dynamic';

interface EmbedPageProps {
  params: Promise<{ handle: string }>;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function generateMetadata(): Promise<Metadata> {
  // Embeds are private surfaces meant to be iframed — never index them, and
  // never leak a host name into a crawlable title.
  return {
    title: 'Book a meeting · JKKN',
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { handle } = await params;

  // One service-role client shared by both reads. Resolve bookability and theme
  // in parallel; the resolve is authoritative (the existing D20 gate), the
  // theme is additive and fails to the default.
  const supabase = serviceClient();
  const [host, themeColor] = await Promise.all([
    PublicHostService.resolveBookableHost(supabase, handle),
    readThemeColor(supabase, handle),
  ]);

  if (!host || host.meetingTypes.length === 0) notFound();

  return (
    <EmbedBookingWidget
      handle={host.handle}
      name={host.name}
      designation={host.designation}
      departmentName={host.departmentName}
      institutionName={host.institutionName}
      headline={host.headline}
      avatarUrl={host.avatarUrl}
      meetingTypes={host.meetingTypes}
      themeColor={themeColor ?? DEFAULT_THEME_COLOR}
    />
  );
}
