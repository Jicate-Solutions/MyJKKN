/**
 * LC-003: Event Coordination - Events List Page
 * Shows upcoming, past, and user's events in a tabbed view
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { EventListClient } from './event-list-client';

export default async function EventsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();
  const isMD = profile.role === 'super_admin';

  // Fetch events server-side for initial render
  // Non-MD users see institution-scoped events by default
  const now = new Date().toISOString();

  let upcomingQuery = supabase
    .from('lc_events')
    .select('*, proposer:profiles!proposed_by(id, full_name, avatar_url), institution:institutions(id, name)', { count: 'exact' })
    .in('status', ['approved', 'published', 'in_progress'])
    .gte('ends_at', now)
    .order('starts_at', { ascending: true })
    .limit(20);

  let pastQuery = supabase
    .from('lc_events')
    .select('*, proposer:profiles!proposed_by(id, full_name, avatar_url), institution:institutions(id, name)', { count: 'exact' })
    .in('status', ['completed'])
    .order('ends_at', { ascending: false })
    .limit(20);

  // Apply institution scope for non-MD users
  if (!isMD && profile.institution_id) {
    upcomingQuery = upcomingQuery.eq('institution_id', profile.institution_id);
    pastQuery = pastQuery.eq('institution_id', profile.institution_id);
  }

  const [
    { data: upcomingEvents, count: upcomingCount },
    { data: pastEvents, count: pastCount },
    { data: myEvents, count: myCount },
  ] = await Promise.all([
    upcomingQuery,
    pastQuery,
    supabase
      .from('lc_events')
      .select('*, proposer:profiles!proposed_by(id, full_name, avatar_url), institution:institutions(id, name)', { count: 'exact' })
      .eq('proposed_by', profile.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <EventListClient
        initialUpcoming={upcomingEvents || []}
        upcomingCount={upcomingCount || 0}
        initialPast={pastEvents || []}
        pastCount={pastCount || 0}
        initialMyEvents={myEvents || []}
        myCount={myCount || 0}
        userId={profile.id}
      />
    </div>
  );
}
