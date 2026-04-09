/**
 * LC-004: OD Management - My OD Requests Page
 * List of user's OD requests with status tracking + Create form
 */

import { createClient } from '@/lib/supabase/server';
import { ODRequestsClient } from './od-requests-client';

export default async function ODRequestsPage() {
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

  // Fetch user's OD requests
  const { data: myRequests } = await supabase
    .from('lc_od_requests')
    .select(`
      *,
      requester:profiles!requester_id(id, full_name, email),
      chain:lc_od_approval_chains(id, name, steps),
      event:lc_events(id, title),
      approvals:lc_od_approvals(*, approver:profiles!approver_id(id, full_name))
    `)
    .eq('requester_id', profile.id)
    .order('created_at', { ascending: false });

  // Fetch available events for linking
  const now = new Date().toISOString();
  const { data: upcomingEvents } = await supabase
    .from('lc_events')
    .select('id, title, starts_at, ends_at, requires_od')
    .in('status', ['approved', 'published'])
    .gte('ends_at', now)
    .order('starts_at', { ascending: true })
    .limit(50);

  return (
    <div className="space-y-6">
      <ODRequestsClient
        initialRequests={myRequests || []}
        upcomingEvents={upcomingEvents || []}
        userId={profile.id}
        institutionId={profile.institution_id || ''}
      />
    </div>
  );
}
