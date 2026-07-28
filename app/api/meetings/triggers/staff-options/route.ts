// app/api/meetings/triggers/staff-options/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR4 console: alert-owner picker options.
//   GET ?institution_id=<uuid>
//     → { options: [{ value: <staff.id>, label: "<name> — <designation>" }],
//         truncated: boolean }
//
// Feeds the "Alert owner" column on the Missing-attendance card. The owner is
// only used when a college has no ACTIVE Principal profile — without it the
// alert falls back to `profiles where is_super_admin` **.limit(5)**, i.e. up to
// 5 administrators, not "every" one (prod has 14 super-admins today).
// See resolveRecipients in lib/services/meetings/meeting-trigger-service.ts.
//
// Access gate: the SAME pair the page uses — rpc('is_super_admin') OR
// rpc('is_admin'). is_admin() is `is_super_admin OR role IN ('admin',
// 'super_admin','administrator')`; checking the profiles row by hand missed
// 'administrator' and 403'd a user the page had already let in (1 such live
// account today: vg@jkkn.ac.in).
//
// Data gate: reads staff with the service-role client because RLS would
// restrict an admin to their own institution and this console spans every
// college. `institution_id` is validated as a uuid and used as an equality
// filter, so a caller can only ever read one college's list at a time.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

/**
 * Hard ceiling on returned options. The largest college has 156 active staff
 * with a profile today, so this is unreachable in practice — but when it IS
 * hit the response says so (`truncated: true`) and the console tells the user
 * the list was cut short, instead of silently showing a partial roster.
 * We ask the DB for MAX_OPTIONS + 1 rows so "exactly 500" is not a false
 * positive.
 */
const MAX_OPTIONS = 500;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const [{ data: isSuperAdmin }, { data: isAdmin }] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('is_admin')
  ]);
  return { user, isAdmin: isSuperAdmin === true || isAdmin === true };
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { user, isAdmin } = await requireAdmin(supabase);
    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin)
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );

    const institutionId = request.nextUrl.searchParams.get('institution_id');
    if (!institutionId || !UUID_RE.test(institutionId))
      return NextResponse.json(
        { error: 'institution_id (uuid) is required' },
        { status: 400 }
      );

    const service = createServiceRoleClient();
    const { data, error } = await service
      .from('staff')
      .select('id, first_name, last_name, designation')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .not('profile_id', 'is', null)
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true })
      .limit(MAX_OPTIONS + 1);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    const truncated = rows.length > MAX_OPTIONS;
    const options = rows.slice(0, MAX_OPTIONS).map((s: any) => {
      const name = [s.first_name, s.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      return {
        value: s.id as string,
        label: s.designation ? `${name} — ${s.designation}` : name
      };
    });

    return NextResponse.json({ options, truncated, limit: MAX_OPTIONS });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
