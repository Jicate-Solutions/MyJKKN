/**
 * LC-004: OD Management - Pending Approvals Page
 * List of OD requests waiting for the current user's approval
 */

import { createClient } from '@/lib/supabase/server';
import { ODApprovalsClient } from './approvals-client';

export default async function ODApprovalsPage() {
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
