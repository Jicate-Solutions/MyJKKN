// app/(public)/book/[slug]/page.tsx
//
// PUBLIC routed-booking page — Path W task #10.
//
// A prospective student/parent (no login) books a counseling call:
//   1. fills the config-driven question form,
//   2. MyJKKN round-robin picks the least-loaded provisioned counselor,
//   3. picks a live slot → booking is created on Cal.com (headless engine),
//      webhook mirrors it into jicate_booking_mirror → counselor's /meetings/inbox.
//
// This server component only loads the PUBLIC subset of the routing config
// (display name, questions, duration) via service-role — institution ids and
// pool internals never reach the client. All writes happen in
// app/api/public/booking/[slug]/{slots,book} (rate-limited + honeypot).
//
// Pattern: app/(public)/refer/page.tsx (public, no sidebar, no auth).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  MeetingRoutingService,
  type RoutingQuestion,
} from '@/lib/services/integrations/meeting-routing-service';
import { BookingWidget } from './_components/booking-widget';

export const dynamic = 'force-dynamic';

interface BookPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = await loadConfig(slug);
  return {
    title: config
      ? `${config.display_name} · Book a counseling call · JKKN`
      : 'Book a counseling call · JKKN',
    robots: { index: false },
  };
}

async function loadConfig(slug: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return MeetingRoutingService.getActiveConfigBySlug(supabase, slug);
}

export default async function PublicBookingPage({ params }: BookPageProps) {
  const { slug } = await params;
  const config = await loadConfig(slug);
  if (!config) notFound();

  const questions: RoutingQuestion[] = config.form_schema.filter(
    (q) => q && typeof q.q === 'string' && (q.type === 'text' || q.type === 'select'),
  );

  return (
    <BookingWidget
      slug={config.slug}
      displayName={config.display_name}
      durationMin={config.meeting_duration_min}
      questions={questions}
    />
  );
}
