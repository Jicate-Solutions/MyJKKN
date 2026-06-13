// app/(public)/m/[token]/page.tsx
//
// PUBLIC Family Moments gift page — Father's Day 2026 (NV CBSE + Matric HSS).
//
// A parent (no login) opens a personalized link from WhatsApp:
//   1. server component loads the moment by unguessable token (service role —
//      there are NO anon RLS policies on family_moments by design),
//   2. records the open (opened_at + open_count) in the same request,
//   3. renders the child's message/drawing as a card, then the PWA install CTA.
//
// Pattern: app/(public)/book/[slug]/page.tsx (public, no sidebar, no auth,
// robots noindex, force-dynamic, service-role read scoped to a narrow column set).

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { GiftCard } from './_components/gift-card';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Link-preview crawlers GET every URL the moment the WhatsApp message is
// delivered — without this filter, all 456 opened_at stamps would land at
// SEND time, not when fathers actually tap. Bots still get the page (the
// preview card benefits); they just don't count as opens.
const BOT_UA_RE =
  /whatsapp|facebookexternalhit|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|bot|crawler|spider|preview/i;

interface MomentPageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'A surprise for you · JKKN Schools',
    description: 'Someone special has left you a Father’s Day surprise.',
    robots: { index: false, follow: false },
  };
}

interface MomentRow {
  id: string;
  content_type: 'auto' | 'text' | 'image';
  message_text: string | null;
  media_url: string | null;
  child_name: string;
  child_class: string | null;
  recipient_name: string | null;
  opened_at: string | null;
  open_count: number;
  campaign: {
    title: string;
    occasion: string;
    recipient_type: string;
    status: string;
    institution: { name: string } | null;
  } | null;
}

async function loadAndRecordOpen(
  token: string,
  recordOpen: boolean,
): Promise<MomentRow | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('family_moments')
    .select(
      `id, content_type, message_text, media_url, child_name, child_class,
       recipient_name, opened_at, open_count,
       campaign:family_moments_campaigns!campaign_id (
         title, occasion, recipient_type, status,
         institution:institutions!institution_id ( name )
       )`,
    )
    .eq('token', token)
    .maybeSingle();

  if (error || !data) return null;

  const moment = data as unknown as MomentRow;

  // Archived campaigns stop serving (links are not forever by default).
  if (moment.campaign && moment.campaign.status === 'archived') return null;

  // Record the open in the same request — first open stamps opened_at.
  // Skipped for bot/preview user agents (see BOT_UA_RE).
  if (recordOpen) {
    await supabase
      .from('family_moments')
      .update({
        opened_at: moment.opened_at ?? new Date().toISOString(),
        open_count: (moment.open_count ?? 0) + 1,
      })
      .eq('id', moment.id);
  }

  return moment;
}

export default async function MomentPage({ params }: MomentPageProps) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const ua = (await headers()).get('user-agent') ?? '';
  const isBot = ua === '' || BOT_UA_RE.test(ua);

  const moment = await loadAndRecordOpen(token, !isBot);
  if (!moment) notFound();

  return (
    <GiftCard
      token={token}
      childName={moment.child_name}
      childClass={moment.child_class}
      recipientName={moment.recipient_name}
      contentType={moment.content_type}
      messageText={moment.message_text}
      mediaUrl={moment.media_url}
      schoolName={moment.campaign?.institution?.name ?? 'JKKN Schools'}
    />
  );
}
