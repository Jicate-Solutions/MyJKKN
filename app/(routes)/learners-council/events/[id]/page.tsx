/**
 * LC-003: Event Coordination - Event Detail Page
 * Server component that fetches event by ID and renders client component
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { EventDetailClient } from './event-detail-client';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const { id } = await params;
  const supabase = await createClient();

  // Fetch event with participants and approvals
  const { data: event, error } = await supabase
    .from('lc_events')
    .select(`
      *,
      proposer:profiles!proposed_by(id, full_name, avatar_url),
      institution:institutions(id, name),
      participants:lc_event_participants(*, user:profiles!user_id(id, full_name, email)),
      approvals:lc_event_approvals(*, approver:profiles!approver_id(id, full_name))
    `)
    .eq('id', id)
    .single();

  if (error || !event) {
    notFound();
  }

  // Check if current user is registered
  const isRegistered = (event.participants || []).some(
    (p: any) => p.user_id === profile.id && p.status !== 'cancelled'
  );

  // Check if current user is the proposer
  const isProposer = event.proposed_by === profile.id;

  return (
    <div className="space-y-6">
      <EventDetailClient
        event={event as any}
        userId={profile.id}
        isRegistered={isRegistered}
        isProposer={isProposer}
      />
    </div>
  );
}
