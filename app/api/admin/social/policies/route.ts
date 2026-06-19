export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/social/policies
 * List all social.* platform_policies rows.
 * Role: super_admin only.
 *
 * Cloned from app/api/admin/cdc/policies/route.ts. Same auth-guard shape
 * (reads profiles.role + is_super_admin), same write-through service, same
 * { ok, data } / { error } envelope. Guard is super-admin only (no cdc_head
 * equivalent for the Social Governance surface).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listSocialPolicies } from '@/lib/services/admin/social-admin-service';

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

export async function GET() {
  const auth = await requireSocialAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = await createClient();
  const { data, error } = await listSocialPolicies(supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
