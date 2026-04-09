/**
 * LC-004: OD Management - Approval Chain Configuration
 * Staff/admin only - Configure approval chains per institution
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ApprovalChainsClient } from './chains-client';

export default async function ApprovalChainsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  const institutionId = profile.institution_id || '';

  // Fetch existing approval chains
  const { data: chains } = await supabase
    .from('lc_od_approval_chains')
    .select('*')
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <ApprovalChainsClient
        initialChains={chains || []}
        userId={profile.id}
        institutionId={institutionId}
      />
    </div>
  );
}
