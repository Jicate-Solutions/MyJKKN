/**
 * LC-003: Event Coordination - Events List Page
 * Shows upcoming, past, and user's events in a tabbed view
 */

import { createClient } from '@/lib/supabase/server';
import { EventListClient } from './event-list-client';
import Link from 'next/link';

export default async function EventsPage({
  searchParams
}: {
  searchParams?: Promise<{ scope?: string }>;
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
  const isMD = profile.role === 'super_admin';

  // Resolve scope: MD defaults to lc_wide, others default to institution
  const params = searchParams ? await searchParams : {};
  const scopeParam = params.scope;
  const scopeAll = isMD ? (scopeParam !== 'institution') : (scopeParam === 'lc_wide');

  // Fetch events server-side for initial render
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

  // Apply institution scope when not viewing LC-wide
  if (!scopeAll && profile.institution_id) {
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
      {/* Scope Toggle */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Viewing:</span>
          <div className="flex rounded-md border overflow-hidden">
            <Link
              href="/learners-council/events?scope=institution"
              className={`px-3 py-1.5 text-sm ${!scopeAll ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >
              My Institution
            </Link>
            <Link
              href="/learners-council/events?scope=lc_wide"
              className={`px-3 py-1.5 text-sm border-l ${scopeAll ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >
              LC-Wide
            </Link>
          </div>
        </div>
      </div>

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
