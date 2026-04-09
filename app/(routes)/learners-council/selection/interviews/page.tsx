/**
 * LC-005: Selection & Elections - Interviews Page
 * Dedicated page for scheduling, tracking, and scoring YUVA chair/co-chair interviews
 */

import { createClient } from '@/lib/supabase/server';
import { InterviewsClient } from './interviews-client';

interface InterviewsPageProps {
  searchParams: Promise<{ election?: string }>;
}

export default async function InterviewsPage({ searchParams }: InterviewsPageProps) {
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

  const params = await searchParams;
  const electionId = params.election || '';

  // Fetch all elections for the filter dropdown
  const { data: allElections } = await supabase
    .from('lc_elections')
    .select('id, title, status, type')
    .order('created_at', { ascending: false });

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );

  return (
    <InterviewsClient
      userId={profile.id}
      userName={profile.full_name || 'Unknown'}
      institutionId={profile.institution_id}
      electionId={electionId}
      allElections={allElections || []}
      isStaffOrAdmin={isStaffOrAdmin}
    />
  );
}
