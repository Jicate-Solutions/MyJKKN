export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/social/policies/[key]  — read a single social.* policy.
 * PATCH  /api/admin/social/policies/[key]  — update a single social.* policy value.
 *
 * Body (PATCH): { value: boolean | number | string | array | object }
 * Role: super_admin only.
 *
 * Cloned from app/api/admin/cdc/policies/[key]/route.ts. Same auth-guard shape,
 * same write-through to platform_policies via the social admin service, same
 * envelope. No cdc_head / "major key" tier — the whole Social Governance surface
 * is super-admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSocialPolicy, updateSocialPolicy } from '@/lib/services/admin/social-admin-service';

async function requireSocialAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const allowed = profile.is_super_admin || profile.role === 'super_admin';

  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, userId: user.id };
}

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { key: rawKey } = await ctx.params;
  const key = decodeURIComponent(rawKey);

  if (!key.startsWith('social.')) {
    return NextResponse.json({ error: 'Unknown policy key' }, { status: 400 });
  }

  const auth = await requireSocialAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = await createClient();
  const { data, error } = await getSocialPolicy(supabase, key);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { key: rawKey } = await ctx.params;
  const key = decodeURIComponent(rawKey);

  if (!key.startsWith('social.')) {
    return NextResponse.json({ error: 'Unknown policy key' }, { status: 400 });
  }

  const auth = await requireSocialAdmin();
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
  const { error } = await updateSocialPolicy(supabase, key, body.value, auth.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
