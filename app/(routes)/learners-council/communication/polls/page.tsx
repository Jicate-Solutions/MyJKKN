/**
 * Learners Council Communication Hub - Polls Page
 * Lists active polls, vote interface, create poll form, results view
 */

import { createClient } from '@/lib/supabase/server';
import { PollsClient } from './polls-client';

export default async function PollsPage() {
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

  // Fetch initial polls server-side
  const { data: polls } = await supabase
    .from('lc_polls')
    .select(
      `
      *,
      options:lc_poll_options(id, poll_id, label, sort_order, vote_count),
      creator:profiles!lc_polls_created_by_fkey(id, full_name)
    `
    )
    .in('status', ['active', 'closed'])
    .order('created_at', { ascending: false })
    .limit(20);

  // Check if user is an LC member
  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  const isLCMember = !!lcMembership;
  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );
  const canCreate = isLCMember || isStaffOrAdmin;

  return (
    <PollsClient
      initialPolls={polls || []}
      userId={profile.id}
      canCreate={canCreate}
    />
  );
}
