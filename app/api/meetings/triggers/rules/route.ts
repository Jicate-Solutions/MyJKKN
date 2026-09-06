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
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import {
  listTriggerRulesWithRates,
  updateTriggerRule
} from '@/lib/services/meetings/meeting-trigger-service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The alert-owner picker only ever offers same-institution staff, but the API
 * is the boundary — `updateTriggerRule` accepts any uuid and writes it straight
 * to `meeting_trigger_rules.alert_owner_staff_id`, so a hand-rolled PATCH could
 * point College A's data-gap alert at a staff member of College B (that person
 * would then receive A's attendance alerts). Validate the pairing server-side.
 *
 * Returns null when the value is acceptable, or a message to 400 with.
 */
async function validateAlertOwner(
  ruleId: string,
  staffId: string
): Promise<string | null> {
  if (!UUID_RE.test(staffId)) return 'alert_owner_staff_id must be a uuid';

  const service = createServiceRoleClient();
  const [{ data: rule }, { data: owner }] = await Promise.all([
    service
      .from('meeting_trigger_rules')
      .select('institution_id')
      .eq('id', ruleId)
      .maybeSingle(),
    service
      .from('staff')
      .select('institution_id, is_active')
      .eq('id', staffId)
      .maybeSingle()
  ]);

  if (!rule) return 'Rule not found';
  if (!owner) return 'Alert owner not found';
  if ((owner as any).is_active === false)
    return 'Alert owner is not an active team member';
  if (
    !(rule as any).institution_id ||
    (owner as any).institution_id !== (rule as any).institution_id
  )
    return 'Alert owner must belong to the same institution as the rule';
  return null;
}

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

    // A uuid owner must belong to the same college as the rule. `null` clears
    // it and `undefined` leaves it untouched — neither needs checking.
    if (typeof body.alert_owner_staff_id === 'string') {
      const ownerError = await validateAlertOwner(
        body.id,
        body.alert_owner_staff_id
      );
      if (ownerError)
        return NextResponse.json({ error: ownerError }, { status: 400 });
    }

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
