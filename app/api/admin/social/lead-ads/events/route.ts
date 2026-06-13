export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/social/lead-ads/events
 *
 * Last-N events log for the admin page. Pageable with ?limit + ?cursor.
 * Defaults to last 50, status=any. Filterable by ?form_id, ?status.
 *
 * Role: super_admin / administrator (RLS already gates SELECT on
 * meta_leagen_events to admin-only; this route just shapes the payload).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin(permissionKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false as const, status: 403 };

  let allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'administrator';

  // 2026-06-11 granular-permission retrofit: roles granted the social.*
  // key via Role Management pass too.
  if (!allowed) {
    const { data: perm } = await supabase.rpc('user_has_permission', {
      permission_name: permissionKey,
    });
    allowed = !!perm;
  }
  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, supabase };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin('social.lead_ads.view');
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = auth.supabase;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '50'), 1), 200);
  const status = url.searchParams.get('status');
  const formId = url.searchParams.get('form_id');

  let q = supabase
    .from('meta_leadgen_events')
    .select(
      'id, form_id, fb_form_id, fb_page_id, fb_leadgen_id, status, lead_id, ' +
        'error_message, received_at, processed_at, attempt_count'
    )
    .order('received_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (formId) q = q.eq('form_id', formId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data ?? [] });
}
