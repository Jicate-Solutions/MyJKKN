/**
 * LC-003: Event Coordination - Calendar View Page
 * Server component that sets up the calendar with current month data
 */

import { createClient } from '@/lib/supabase/server';
import { CalendarClient } from './calendar-client';

export default async function EventCalendarPage() {
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

  // Fetch events for current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const { data: events } = await supabase
    .from('lc_events')
    .select('*, proposer:profiles!proposed_by(id, full_name, avatar_url), institution:institutions(id, name)')
    .gte('starts_at', startOfMonth)
    .lte('starts_at', endOfMonth)
    .in('status', ['pending_review', 'approved', 'published', 'in_progress', 'completed'])
    .order('starts_at', { ascending: true });

  return (
    <div className="space-y-6">
      <CalendarClient
        initialEvents={events || []}
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth()}
      />
    </div>
  );
}
