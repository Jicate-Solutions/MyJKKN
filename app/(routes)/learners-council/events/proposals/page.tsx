/**
 * LC-003: Event Coordination - Event Proposals Page
 * Create event form + list of user's proposals with status tracking
 */

import { createClient } from '@/lib/supabase/server';
import { EventProposalsClient } from './proposals-client';

export default async function EventProposalsPage() {
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

  return (
    <div className="space-y-6">
      <EventProposalsClient
        initialProposals={myProposals || []}
        userId={profile.id}
        institutionId={profile.institution_id || ''}
      />
    </div>
  );
}
