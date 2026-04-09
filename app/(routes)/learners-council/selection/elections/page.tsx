/**
 * LC-005: Selection & Elections - Elections Page
 * Dedicated election management: create elections, cast votes, view results
 */

import { createClient } from '@/lib/supabase/server';
import { ElectionsClient } from './elections-client';

export default async function ElectionsPage() {
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

  // Fetch all elections with nomination counts and term info
  const { data: elections } = await supabase
    .from('lc_elections')
    .select(`
      *,
      nominations:lc_nominations(id, status, nominee_id),
      term:lc_terms(id, name, start_date, end_date)
    `)
    .order('created_at', { ascending: false });

  // Fetch available terms for the create election form
  const { data: terms } = await supabase
    .from('lc_terms')
    .select('id, name, start_date, end_date, status')
    .in('status', ['upcoming', 'active'])
    .order('start_date', { ascending: false });

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );

  return (
    <ElectionsClient
      elections={elections || []}
      terms={terms || []}
      userId={profile.id}
      userRole={profile.role || 'student'}
      isStaffOrAdmin={isStaffOrAdmin}
    />
  );
}
