/**
 * LC-005: Selection & Elections - Interviews Page
 * Dedicated page for scheduling, tracking, and scoring YUVA chair/co-chair interviews
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InterviewsClient } from './interviews-client';

interface InterviewsPageProps {
  searchParams: Promise<{ election?: string }>;
}

export default async function InterviewsPage({ searchParams }: InterviewsPageProps) {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/');
  }

  const params = await searchParams;
  const electionId = params.election || '';

  const supabase = await createClient();

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
