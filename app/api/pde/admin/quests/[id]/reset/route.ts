export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// POST /api/pde/admin/quests/[id]/reset — "clean reset" of a quest's pilot data.
//
// Wipes a single quest's pilot SIGN-UPS (pde_quest_enrollments) and SCORES
// (pde_quest_submissions) so an admin can start the pilot over from zero. It
// deliberately does NOT touch pde_demonstrations or pde_agency_index — those
// come from a separate assessment pipeline, not the quest sign-up/score loop.
//
// Gated to super-admin only (mirrors the gate in app/api/pde/analytics/route.ts):
// this is a destructive, cross-learner delete, so it is restricted to a global
// admin rather than a per-college permission. The actual delete runs through the
// service-role client (bypasses RLS) — safe precisely because the super-admin
// gate above has already been enforced.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();
    const allowed =
      !!profile &&
      (profile.is_super_admin ||
        profile.role === 'super_admin' ||
        profile.role === 'administrator');
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: questId } = await params;

    const svc = createServiceRoleClient();

    // Delete submissions (scores) BEFORE enrollments (sign-ups) to avoid any
    // FK ordering issues, and count exactly how many rows each delete removed.
    const { count: subs } = await (svc as any)
      .from('pde_quest_submissions')
      .delete({ count: 'exact' })
      .eq('quest_id', questId);

    const { count: enr } = await (svc as any)
      .from('pde_quest_enrollments')
      .delete({ count: 'exact' })
      .eq('quest_id', questId);

    return NextResponse.json({
      data: {
        deleted_submissions: subs ?? 0,
        deleted_enrollments: enr ?? 0,
      },
    });
  } catch (e: any) {
    console.error('Error resetting PDE quest pilot data:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
