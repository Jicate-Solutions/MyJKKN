/**
 * LC-004: OD Management - Approval Chain Configuration
 *
 * Visible to any Learners Council member (read-only); only LC office bearers
 * (President / Vice President / Secretary / Treasurer) or a super admin may create or
 * change a chain -- enforced in the database by lc_od_chains_insert / lc_od_chains_update.
 *
 * Chains are listed for EVERY institution, not just the viewer's. The office bearers are
 * LC-wide posts (lc_positions.institution_id IS NULL, one holder each), so scoping this
 * page to the viewer's own institution left every college without a local chain-creator
 * unable to run OD at all.
 */

import { createClient } from '@/lib/supabase/server';
import { ApprovalChainsClient } from './chains-client';
import { getLCAccess, canSeeODChains, canManageODChains } from '@/lib/learners-council/lc-roles';

export default async function ApprovalChainsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_super_admin, full_name, avatar_url, email')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }

  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id, position:lc_positions(id, category, tier)')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  const access = getLCAccess(
    profile,
    lcMembership
      ? {
          position_category: (lcMembership.position as any)?.category,
          tier: (lcMembership.position as any)?.tier,
        }
      : null
  );

  // Explicit refusal rather than a silent redirect, so the reason is visible on first click.
  if (!canSeeODChains(access)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-medium">You don&apos;t have access to approval chains</p>
        <p className="text-muted-foreground text-sm mt-1 max-w-md">
          Approval chains are visible to Learners Council members. If you believe you should
          be on the Council, contact the LC Secretary.
        </p>
      </div>
    );
  }

  const canManage = canManageODChains(access);

  const { data: chains, error: chainsError } = await supabase
    .from('lc_od_approval_chains')
    .select('*, institution:institutions(id, name)')
    .order('created_at', { ascending: false });

  if (chainsError) {
    console.error('[learners-council/od] Error fetching approval chains:', chainsError);
  }

  // Only needed for the create form's institution picker.
  const { data: institutions } = canManage
    ? await supabase.from('institutions').select('id, name').order('name')
    : { data: [] as { id: string; name: string }[] };

  return (
    <div className="space-y-6">
      <ApprovalChainsClient
        initialChains={chains || []}
        userId={profile.id}
        canManage={canManage}
        institutions={institutions || []}
      />
    </div>
  );
}
