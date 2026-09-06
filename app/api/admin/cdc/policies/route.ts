export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/cdc/policies
 * List all cdc.* platform_policies rows.
 * Role: super_admin OR cdc_head
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listCdcPolicies } from '@/lib/services/admin/cdc-admin-service';

async function requireCdcAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'cdc_head' ||
    profile.role === 'administrator';

  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, userId: user.id };
}

export async function GET() {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = await createClient();
  const { data, error } = await listCdcPolicies(supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
