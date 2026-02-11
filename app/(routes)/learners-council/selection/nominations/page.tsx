/**
 * LC-005: Selection & Elections - Nominations Page
 * Self-nomination form, nomination listing, interview scheduling,
 * interview scoring, and results view
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NominationsClient } from './_components/nominations-client';

interface NominationsPageProps {
  searchParams: Promise<{ election?: string }>;
}

export default async function NominationsPage({ searchParams }: NominationsPageProps) {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/');
  }

  const params = await searchParams;
  const electionId = params.election || '';

  const supabase = await createClient();

  // Fetch election details if ID provided
  let election = null;
  if (electionId) {
    const { data } = await supabase
      .from('lc_elections')
      .select(`
        *,
        term:lc_terms(id, name, start_date, end_date)
      `)
      .eq('id', electionId)
      .single();
    election = data;
  }

  // Fetch all elections for the dropdown (if no specific election selected)
  const { data: allElections } = await supabase
    .from('lc_elections')
    .select('id, title, status, type')
    .order('created_at', { ascending: false });

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );

  return (
    <NominationsClient
      election={election}
      electionId={electionId}
      allElections={allElections || []}
      userId={profile.id}
      userName={profile.full_name || 'Unknown'}
      isStaffOrAdmin={isStaffOrAdmin}
    />
  );
}
