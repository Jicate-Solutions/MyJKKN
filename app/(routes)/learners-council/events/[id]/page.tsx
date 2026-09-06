/**
 * LC-003: Event Coordination - Event Detail Page
 * Server component that fetches event by ID and renders client component
 */

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { getLCAccess, getLCRole, canReviewEventProposals } from '@/lib/learners-council/lc-roles';
import { EventDetailClient } from './event-detail-client';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name, avatar_url, email')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }

  const { id } = await params;

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

  // Resolve reviewer standing. Without these two props the client defaults
  // isStaffOrAdmin to false, which hid the Approve/Reject buttons from everyone —
  // so a pending_review event had no reachable decision anywhere in the UI.
  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id, position_id, status, position:lc_positions(category, tier)')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  const membershipInfo = lcMembership
    ? {
        position_category: (lcMembership.position as { category?: string | null } | null)?.category,
        tier: (lcMembership.position as { tier?: string | null } | null)?.tier,
      }
    : null;

  const canReview = canReviewEventProposals(getLCAccess(profile, membershipInfo));

  return (
    <div className="space-y-6">
      <EventDetailClient
        event={event as any}
        userId={profile.id}
        isRegistered={isRegistered}
        isProposer={isProposer}
        isStaffOrAdmin={canReview}
        userRole={getLCRole(profile.role || null, membershipInfo)}
      />
    </div>
  );
}
