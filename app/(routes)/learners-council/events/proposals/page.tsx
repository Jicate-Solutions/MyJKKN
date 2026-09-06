/**
 * LC-003: Event Coordination - Event Proposals Page
 * Create event form + list of user's proposals with status tracking
 */

import { createClient } from '@/lib/supabase/server';
import { getLCAccess, getLCRole, canReviewEventProposals } from '@/lib/learners-council/lc-roles';
import { EventProposalsClient, type ReviewQueueItem } from './proposals-client';

const MS_PER_DAY = 86_400_000;

export default async function EventProposalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedTab = sp.tab === 'review' ? 'review' : sp.tab === 'mine' ? 'mine' : null;
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

  // Fetch user's event proposals
  const { data: myProposals } = await supabase
    .from('lc_events')
    .select(`
      *,
      proposer:profiles!proposed_by(id, full_name, avatar_url),
      institution:institutions(id, name),
      approvals:lc_event_approvals(*, approver:profiles!approver_id(id, full_name))
    `)
    .eq('proposed_by', profile.id)
    .order('created_at', { ascending: false });

  // Resolve the viewer's Council standing the same way the dashboard does, so the
  // review queue appears for exactly the people its "Awaiting Your Approval" card
  // already points here.
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

  const access = getLCAccess(profile, membershipInfo);
  const canReview = canReviewEventProposals(access);
  const isSuperAdminViewer = profile.role === 'super_admin';

  // Every proposal awaiting a decision, whoever proposed it — oldest first, because
  // the queue's whole job is to surface what has been waiting longest. Only fetched
  // for reviewers; RLS remains the backstop.
  let reviewQueueRows: unknown[] = [];
  if (canReview) {
    let q = supabase
      .from('lc_events')
      .select(`
        *,
        proposer:profiles!proposed_by(id, full_name, avatar_url),
        institution:institutions(id, name),
        approvals:lc_event_approvals(*, approver:profiles!approver_id(id, full_name))
      `)
      .eq('status', 'pending_review')
      .order('updated_at', { ascending: true, nullsFirst: true });

    // Tenant scope. institution_id IS NULL means institution-WIDE, so a bare
    // .eq() would hide exactly the proposals this queue exists to surface —
    // both of the ones stuck since 13-14 Jul are reachable only because of the
    // is.null arm. Super admins see the estate; RLS stays the backstop.
    if (!isSuperAdminViewer) {
      q = profile.institution_id
        ? q.or(`institution_id.eq.${profile.institution_id},institution_id.is.null`)
        : q.is('institution_id', null);
    }

    const { data } = await q;
    reviewQueueRows = data ?? [];
  }

  // Lapse and wait are computed HERE, off ONE server clock, and passed down as
  // props. Computing them in the client made the same card render differently on
  // the server and after hydration.
  const nowMs = Date.now();
  const reviewQueue: ReviewQueueItem[] = reviewQueueRows.map((row) => {
    const raw = row as Record<string, unknown>;
    const startMs = new Date(String(raw.starts_at ?? '')).getTime();
    const sinceMs = new Date(
      String(raw.updated_at ?? raw.created_at ?? ''),
    ).getTime();
    return {
      ...(row as ReviewQueueItem),
      daysLapsed:
        Number.isFinite(startMs) && startMs < nowMs
          ? Math.floor((nowMs - startMs) / MS_PER_DAY)
          : null,
      daysWaiting: Number.isFinite(sinceMs)
        ? Math.max(0, Math.floor((nowMs - sinceMs) / MS_PER_DAY))
        : 0,
    };
  });

  // Super admins legitimately have no institution_id on their profile. Pass the
  // raw nullable value (never '') so downstream code can branch correctly and
  // never sends '' as a UUID — see feedback_institution_id_or_empty_string_antipattern.md
  const isSuperAdmin = profile.role === 'super_admin';

  return (
    <div className="space-y-6">
      <EventProposalsClient
        initialProposals={myProposals || []}
        initialReviewQueue={reviewQueue}
        requestedTab={requestedTab}
        canReview={canReview}
        reviewerRole={getLCRole(profile.role || null, membershipInfo)}
        userId={profile.id}
        institutionId={profile.institution_id ?? null}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
