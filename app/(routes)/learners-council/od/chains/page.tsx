/**
 * LC-004: OD Management - Approval Chain Configuration
 * Staff/admin only - Configure approval chains per institution
 */

import { createClient } from '@/lib/supabase/server';
import { ApprovalChainsClient } from './chains-client';

export default async function ApprovalChainsPage() {
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
