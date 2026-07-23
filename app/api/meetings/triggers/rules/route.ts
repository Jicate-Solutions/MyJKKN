// app/api/meetings/triggers/rules/route.ts
// ============================================================================
// Auto-accountability-meeting engine — PR4 console: rules read/update.
//   GET   → list rules with each college's current attendance rate.
//   PATCH → update an editable field (threshold / active / cooldown / cap).
// Director-only (super-admin / admin gate). Writes go through the service's
// validated updateTriggerRule (service-role under the hood).
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  listTriggerRulesWithRates,
  updateTriggerRule
} from '@/lib/services/meetings/meeting-trigger-service';

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

export async function GET() {
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

    const rules = await listTriggerRulesWithRates();
    return NextResponse.json({ rules });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    if (!body?.id)
      return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const result = await updateTriggerRule({
      id: body.id,
      patch: {
        threshold: body.threshold,
        active: body.active,
        cooldown_days: body.cooldown_days,
        weekly_cap: body.weekly_cap,
        alert_owner_staff_id: body.alert_owner_staff_id
      }
    });
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
