/**
 * LC-004: OD Management - Pending Approvals Page
 * List of OD requests waiting for the current user's approval
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ODApprovalsClient } from './approvals-client';

export default async function ODApprovalsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  // Fetch pending OD requests (submitted or in_review)
  const { data: pendingRequests } = await supabase
    .from('lc_od_requests')
    .select(`
      *,
      requester:profiles!requester_id(id, full_name, email),
      chain:lc_od_approval_chains(id, name, steps),
      event:lc_events(id, title),
      approvals:lc_od_approvals(*, approver:profiles!approver_id(id, full_name))
    `)
    .in('status', ['submitted', 'in_review'])
    .order('submitted_at', { ascending: true });

  return (
    <div className="space-y-6">
      <ODApprovalsClient
        initialPending={pendingRequests || []}
        approverId={profile.id}
      />
    </div>
  );
}
