export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/cdc/policies/[key]
 * Update a single cdc.* policy value.
 *
 * Body: { value: boolean | number | string | object }
 * Role: super_admin OR cdc_head (major policies: super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateCdcPolicy } from '@/lib/services/admin/cdc-admin-service';

// Policy keys that require super_admin (not just cdc_head)
const MAJOR_KEYS = new Set([
  'cdc.allow_multiple_active_offers',
  'cdc.aicte_include_internal_placements',
  'cdc.min_attendance_pct_for_internship_certificate',
  'cdc.parent_consent_required_under_age',
]);

async function requireCdcAdmin(key: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const isSuperAdmin = profile.is_super_admin || profile.role === 'super_admin';
  const isCdcAdmin = profile.role === 'cdc_head' || profile.role === 'administrator';

  if (!isSuperAdmin && !isCdcAdmin) return { ok: false as const, status: 403 };

  // Major policy keys require super_admin
  if (MAJOR_KEYS.has(key) && !isSuperAdmin) {
    return { ok: false as const, status: 403 };
  }

  return { ok: true as const, userId: user.id };
}

type RouteContext = { params: Promise<{ key: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { key: rawKey } = await ctx.params;
  const key = decodeURIComponent(rawKey);

  if (!key.startsWith('cdc.')) {
    return NextResponse.json({ error: 'Unknown policy key' }, { status: 400 });
  }

  const auth = await requireCdcAdmin(key);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('value' in body)) {
    return NextResponse.json(
      { error: 'Body must include { value: <new value> }' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await updateCdcPolicy(supabase, key, body.value, auth.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
