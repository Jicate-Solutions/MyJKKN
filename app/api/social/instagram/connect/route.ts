export const dynamic = 'force-dynamic';

/**
 * /api/social/instagram/connect — Instagram Business Login entry point.
 *
 * GET ?dept_id={social_dept_accounts.id}
 *       → 302 to the Instagram authorize dialog (admin clicked "Connect
 *         now" and is logged into the dept IG account on this device).
 *     ?dept_id=...&mode=link
 *       → JSON { authorize_url, expires_in_hours } — admin copies the link
 *         and sends it to the department staffer, who opens it on the
 *         device where the dept Instagram account is logged in. The state
 *         param is HMAC-signed + time-boxed, so the link is self-contained.
 *
 * DELETE { connection_id }
 *       → revoke a connection: status='revoked', token cleared, and the
 *         linked ig_accounts row flips back to metrics_source=
 *         'business_discovery' so the public-metrics poller resumes.
 *
 * Role: super_admin / administrator only (matches the SuperAdminOnly gate
 * on /admission/social/*).
 * Dormant until INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET are configured
 * (returns 503) — see docs/instagram-login-connect-runbook-2026-06-10.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  buildAuthorizeUrl,
  igLoginConfigured,
  signState,
} from '@/lib/instagram/login-client';

async function requireAdmin() {
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

  // 2026-06-11 granular-permission retrofit: roles granted
  // social.instagram.manage via Role Management may run the IG login
  // connect flow too.
  if (!allowed) {
    const { data: perm } = await supabase.rpc('user_has_permission', {
      permission_name: 'social.instagram.manage',
    });
    allowed = !!perm;
  }
  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, supabase };
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: gate.status });
  }

  if (!igLoginConfigured()) {
    return NextResponse.json(
      {
        error:
          'Instagram Login is not configured (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET missing). See docs/instagram-login-connect-runbook-2026-06-10.md.',
      },
      { status: 503 }
    );
  }

  const deptId = request.nextUrl.searchParams.get('dept_id');
  if (!deptId) {
    return NextResponse.json({ error: 'dept_id required' }, { status: 400 });
  }

  // Validate the registry row exists (RLS: admin-only SELECT — the gate
  // above already guarantees the caller can see it).
  const { data: dept } = await gate.supabase
    .from('social_dept_accounts')
    .select('id, username')
    .eq('id', deptId)
    .maybeSingle();
  if (!dept) {
    return NextResponse.json({ error: 'unknown dept_id' }, { status: 404 });
  }

  const authorizeUrl = buildAuthorizeUrl(signState(dept.id));

  if (request.nextUrl.searchParams.get('mode') === 'link') {
    return NextResponse.json({
      authorize_url: authorizeUrl,
      username: dept.username,
      expires_in_hours: 24,
    });
  }
  return NextResponse.redirect(authorizeUrl, 302);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: gate.status });
  }

  let connectionId: string | undefined;
  try {
    const body = (await request.json()) as { connection_id?: string };
    connectionId = body.connection_id;
  } catch {
    /* fall through */
  }
  if (!connectionId) {
    return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
  }

  const supabase = svc();
  const { data: conn } = await supabase
    .from('ig_account_connections')
    .select('id, ig_account_id, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: 'unknown connection' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('ig_account_connections')
    .update({ status: 'revoked', access_token: '', updated_at: now })
    .eq('id', conn.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Hand the account back to the public-metrics lane.
  if (conn.ig_account_id) {
    await supabase
      .from('ig_accounts')
      .update({ metrics_source: 'business_discovery', updated_at: now })
      .eq('id', conn.ig_account_id)
      .eq('metrics_source', 'instagram_login');
  }

  return NextResponse.json({ success: true, data: { id: conn.id, status: 'revoked' } });
}
