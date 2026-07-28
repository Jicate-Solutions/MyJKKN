// app/api/meetings/triggers/staff-options/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR4 console: alert-owner picker options.
//   GET ?institution_id=<uuid> → [{ value: <staff.id>, label: "<name>" }]
// Feeds the "Alert owner" column on the Missing-attendance card. The owner is
// only used when a college has no active Principal profile — without it the
// alert fans out to up to 5 super-admins instead of one named person
// (see resolveRecipients in lib/services/meetings/meeting-trigger-service.ts).
//
// Director-only (same super-admin / admin gate as ./rules). Reads staff with
// the service-role client because RLS would restrict an admin to their own
// institution and this console spans every college.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

const MAX_OPTIONS = 500;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    (profile as any)?.is_super_admin === true ||
    (profile as any)?.role === 'super_admin' ||
    (profile as any)?.role === 'admin';
  return { user, isAdmin };
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
      .limit(MAX_OPTIONS);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const options = (data ?? []).map((s: any) => {
      const name = [s.first_name, s.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      return {
        value: s.id as string,
        label: s.designation ? `${name} — ${s.designation}` : name
      };
    });

    return NextResponse.json({ options });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
