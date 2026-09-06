// app/(public)/poll/[slug]/page.tsx
//
// PUBLIC meeting-poll voting page (Universal Booking M5) — /poll/<slug>.
// An invitee picks one or more candidate times and submits their vote. No
// auth: identity is the email they supply.
//
// Data load uses the fn_get_active_poll RPC (SECURITY DEFINER, anon-granted)
// via a service-role client server-side — only poll-safe fields leave the
// server (no voter PII, no host email).
//
// Explicit states (rule #27 — never a silent redirect):
//   * unknown slug / no options → notFound() (generic 404).
//   * closed poll → the widget renders a "voting has closed" panel.
//
// Pattern: app/(public)/meet/[handle]/page.tsx (server load → client widget).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { PollVoteWidget, type PollView, type PollOptionView } from './_components/poll-vote-widget';

export const dynamic = 'force-dynamic';

interface PollPageProps {
  params: Promise<{ slug: string }>;
}

interface PollRpcRow {
  poll_id: string;
  title: string;
  description: string | null;
  duration_min: number;
  status: string;
  host_name: string | null;
  option_id: string;
  start_time: string;
  end_time: string;
  order_index: number;
  vote_count: number;
}

async function loadPoll(slug: string): Promise<PollView | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.rpc('fn_get_active_poll', { p_slug: slug });
  if (error) {
    console.error('[public/poll] load failed:', error.message);
    return null;
  }
  const rows = (data ?? []) as PollRpcRow[];
  if (rows.length === 0) return null;

  const first = rows[0];
  const options: PollOptionView[] = rows
    .map((r) => ({
      id: r.option_id,
      startTime: r.start_time,
      endTime: r.end_time,
      orderIndex: r.order_index,
      voteCount: Number(r.vote_count) || 0,
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex || a.startTime.localeCompare(b.startTime));

  return {
    slug,
    title: first.title,
    description: first.description,
    durationMin: first.duration_min,
    status: first.status === 'closed' ? 'closed' : 'open',
    hostName: first.host_name ?? 'JKKN Staff',
    options,
  };
}

export async function generateMetadata({ params }: PollPageProps): Promise<Metadata> {
  const { slug } = await params;
  const poll = await loadPoll(slug);
  return {
    title: poll ? `${poll.title} · Pick a time · JKKN` : 'Meeting poll · JKKN',
    robots: { index: false },
  };
}

export default async function PollPage({ params }: PollPageProps) {
  const { slug } = await params;
  const poll = await loadPoll(slug);
  if (!poll) notFound();

  return <PollVoteWidget poll={poll} />;
}
