export const dynamic = 'force-dynamic';

// app/api/learners-council/me/office-bearer/route.ts
// GET /api/learners-council/me/office-bearer — answers ONE question about the
// caller and nobody else: "am I a Learners Council office bearer, and am I an
// administrator?"
//
// WHY this exists: the notification composer draws its audience picker from
// every role in the database, so an elected council office bearer (who is a
// learner) was offered facilitators, HODs and principals as targets. The
// composer uses this answer to narrow what it draws.
//
// THIS IS NOT AN ACCESS CONTROL. It reports what the caller already is; it
// grants nothing. Who may actually receive a notification is decided by the
// send path and by RLS, independently of anything this route says.
//
// WHY no service-role client (unlike the sibling pickers/people route, which
// needs one): the office-bearer test runs through public.fn_is_lc_executive(),
// which is already SECURITY DEFINER and already granted to `authenticated`
// only — see migration
// 20260714160000_lc_executive_gates_and_cross_institution.sql. It reads
// lc_members/lc_positions with definer rights, so the caller's own session is
// sufficient and no RLS bypass is needed here.

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Mirrors the database is_admin() helper: the super-admin flag, or one of the
// administrator role keys. An administrator who also happens to hold a council
// seat keeps the unrestricted composer.
const ADMIN_ROLE_KEYS = ['super_admin', 'admin', 'administrator'];

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // auth.uid() inside the definer function resolves to THIS caller, so the
  // result can only ever describe the person holding the session.
  const { data: isExecutive, error: rpcError } = await supabase.rpc(
    'fn_is_lc_executive'
  );

  if (rpcError) {
    return NextResponse.json(
      { error: 'Failed to resolve council role' },
      { status: 500 }
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin =
    profile?.is_super_admin === true ||
    ADMIN_ROLE_KEYS.includes(profile?.role ?? '');

  return NextResponse.json(
    { isOfficeBearer: isExecutive === true, isAdmin },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
