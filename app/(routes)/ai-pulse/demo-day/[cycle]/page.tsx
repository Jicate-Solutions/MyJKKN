export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface Props {
  params: Promise<{ cycle: string }>;
}

/**
 * AI Pulse — Demo Day (thin redirect to existing event demo-day surface).
 *
 * `cycle` is the `startup_events.id` of the AI Pulse cycle row. We look up
 * the row and verify it is an AI Pulse cycle (`config->>'kind' = 'ai_pulse'`)
 * before forwarding to the existing `/startup-studio/events/[id]/demo-day`
 * page so all auth, RLS, and UI continue to work unchanged. If no matching
 * cycle exists, render 404.
 *
 * Spec: specs/myjkkn-ai-pulse-spec.md (events-extension v3).
 */
export default async function AiPulseDemoDayRedirect({ params }: Props) {
  const { cycle } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: event } = await supabase
    .from('startup_events')
    .select('id')
    .eq('id', cycle)
    .filter('config->>kind', 'eq', 'ai_pulse')
    .maybeSingle();

  if (!event) notFound();

  redirect(`/startup-studio/events/${event.id}/demo-day`);
}
