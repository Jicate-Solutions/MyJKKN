// app/api/cdc/requirements/[id]/roles/[roleId]/matches/route.ts
// CDC staff — rank learners for a role by overlap of the role's required skills
// against learners' self-attributed IDP skills. Delegates to the anon-locked
// SECURITY DEFINER RPC fn_cdc_match_learners_for_role, which self-gates to CDC
// staff and scopes to the caller's accessible institutions.
//
// NOTE: returns [] while no learner has recorded IDP skills yet (currently 0) —
// the UI labels this state ("activates as students complete their IDP"), it is
// NOT an error.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { roleId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase.rpc('fn_cdc_match_learners_for_role', {
    p_role_id: roleId,
    p_limit: 25,
  });
  if (error) {
    console.error('[cdc/requirements/matches] rpc error:', error.message);
    return NextResponse.json({ error: 'Failed to compute matches' }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
