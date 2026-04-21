/**
 * Auth session diagnostic — super-admin only.
 *
 * Why this exists: when Omm reports "director dashboard is empty", the first
 * question is always "what does the server think your session is?". This
 * endpoint answers that in one GET without DevTools-diving or Vercel logs:
 *
 *   curl https://www.jkkn.ai/api/auth/session-debug
 *
 * Returns: auth user, profile role, institution_id, is_super_admin flag,
 * which sb-* cookie chunks are present, and whether fn_dashboard_metrics
 * succeeds for the caller.
 *
 * Authorization: locked to super_admin via profiles.is_super_admin = true.
 * Returns 403 for everyone else (including authenticated non-admins) so this
 * doesn't leak internals. 401 for unauthenticated callers.
 *
 * Created: 2026-04-21 as part of the "surface silent failures" PR.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = await createClient();

  // 1. Who does the server think we are?
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'auth.getUser',
        error: userError?.message ?? 'no user',
        hint: 'Supabase could not read a valid session from the sb-* cookies. Try signing out and back in.'
      },
      { status: 401 }
    );
  }

  // 2. What does the profile say?
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role, is_super_admin, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'profiles.select',
        user_id: user.id,
        error: profileError.message,
        hint: 'Auth succeeded but profile lookup failed — check RLS on profiles table.'
      },
      { status: 500 }
    );
  }

  // 3. Lock to super_admin from here on. Non-admins get 403 (not 404) so
  //    the endpoint's existence is acknowledged for those who should see it.
  if (!profile?.is_super_admin) {
    return NextResponse.json(
      { ok: false, stage: 'authz', error: 'super_admin only' },
      { status: 403 }
    );
  }

  // 4. Cookie chunk inspection — sb-* cookies are split into chunks when large.
  //    Missing chunks are a common silent-failure mode.
  const cookieStore = await cookies();
  const sbCookies = cookieStore
    .getAll()
    .filter((c) => c.name.startsWith('sb-'))
    .map((c) => ({ name: c.name, length: c.value.length }));

  // 5. Smoke-test the dashboard RPC with the caller's own session so we
  //    know whether an "empty dashboard" is cookie/auth or RPC-side.
  let rpcResult: {
    ok: boolean;
    ohs_score?: number;
    error?: string;
    sample?: unknown;
  };
  try {
    const { data, error } = await supabase.rpc('fn_dashboard_metrics', {
      p_institution_id: null,
      p_department_id: null
    });
    if (error) {
      rpcResult = { ok: false, error: error.message };
    } else {
      const payload = data as { ohs?: { score?: number } } | null;
      rpcResult = {
        ok: true,
        ohs_score: payload?.ohs?.score,
        sample: payload
      };
    }
  } catch (err) {
    rpcResult = {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    auth: {
      user_id: user.id,
      email: user.email,
      session_aud: user.aud,
      session_role: user.role
    },
    profile: {
      id: profile?.id,
      email: profile?.email,
      role: profile?.role,
      is_super_admin: profile?.is_super_admin,
      institution_id: profile?.institution_id
    },
    cookies: {
      sb_cookie_count: sbCookies.length,
      sb_cookies: sbCookies
    },
    rpc: {
      fn_dashboard_metrics: rpcResult
    }
  });
}
