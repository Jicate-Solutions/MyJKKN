// app/api/cdc/udyog/portal-url/route.ts — set the external UDYOG portal URL
// (BUG-004075). Stored in platform_policies (the canonical config table) so the
// Director/CDC can change it without a code deploy. Gated on cdc.udyog.manage.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const PORTAL_URL_KEY = 'cdc.udyog.portal_url';

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = (body?.url ?? '').toString().trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Enter a full URL starting with http(s)://' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: canManage } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.udyog.manage' });
    if (canManage !== true) return NextResponse.json({ error: 'Forbidden — cdc.udyog.manage required' }, { status: 403 });

    const svc = createServiceRoleClient();
    const { error } = await svc
      .from('platform_policies')
      .update({ value: url, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('policy_key', PORTAL_URL_KEY)
      .eq('scope_type', 'global');

    if (error) {
      console.error('[cdc/udyog] portal-url update failed:', error);
      return NextResponse.json({ error: 'Could not save the portal URL.' }, { status: 500 });
    }
    return NextResponse.json({ url });
  } catch (e) {
    console.error('[cdc/udyog] portal-url PUT unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
