export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * /api/social/instagram/connect/callback — Instagram Business Login OAuth
 * callback (the redirect URI registered on the Meta app).
 *
 * Deliberately UNAUTHENTICATED: Instagram redirects the browser of whoever
 * authorized — usually a department staffer's phone with no MyJKKN session.
 * The HMAC-signed `state` param (minted by /connect, admin-gated, 24h TTL)
 * is the authorization: it binds this callback to a social_dept_accounts
 * row and cannot be forged without the Instagram App Secret.
 *
 * Flow: verify state → code → short-lived token → long-lived 60-day token
 * (graph.instagram.com ig_exchange_token) → /me profile → upsert
 * ig_account_connections + flip/create the ig_accounts row to
 * metrics_source='instagram_login' → link the registry row → plain-HTML
 * "connected, close this tab" page (no redirect into the admin app — the
 * staffer has no access there).
 */

import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  IgLoginError,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchIgMe,
  igLoginConfigured,
  verifyState,
} from '@/lib/instagram/login-client';

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Standalone result page — works on any device, no app session needed.
 *
 * ⚠️ CONTRACT: `body` is interpolated as RAW HTML (callers use <strong>).
 * Every dynamic value placed into `body` MUST go through escapeHtml() at
 * the call site. `title` is escaped here.
 */
function htmlPage(title: string, body: string, ok: boolean): Response {
  const color = ok ? '#16a34a' : '#dc2626';
  const icon = ok ? '✓' : '✕';
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
.card{max-width:420px;margin:16px;padding:32px;border-radius:12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08);text-align:center}
.badge{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;color:#fff;font-size:24px;background:${color}}
h1{font-size:18px;margin:16px 0 8px}p{color:#475569;font-size:14px;line-height:1.5;margin:0}</style>
</head><body><div class="card"><div class="badge">${icon}</div><h1>${escapeHtml(title)}</h1><p>${body}</p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!igLoginConfigured()) {
    return htmlPage(
      'Instagram Login not configured',
      'The MyJKKN Instagram connection is not set up yet. Please contact the administrator.',
      false
    );
  }

  const params = request.nextUrl.searchParams;

  // User declined on the Instagram consent screen.
  if (params.get('error')) {
    return htmlPage(
      'Authorization declined',
      escapeHtml(
        params.get('error_description') ||
          'The Instagram authorization was cancelled. You can close this tab and try again from a fresh connect link.'
      ),
      false
    );
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return htmlPage('Invalid request', 'Missing code or state parameter.', false);
  }

  const verified = verifyState(state);
  if (!verified.ok || !verified.deptAccountId) {
    return htmlPage(
      'Invalid connect link',
      escapeHtml(verified.reason || 'invalid state'),
      false
    );
  }

  try {
    // 1. code → short-lived → long-lived 60-day token
    const shortToken = await exchangeCodeForToken(code);
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);
    const expiresAt = new Date(
      Date.now() + (longToken.expires_in || 5184000) * 1000
    ).toISOString();

    // 2. who just authorized?
    const me = await fetchIgMe(longToken.access_token);
    const igUserId = String(me.user_id || me.id || shortToken.user_id);
    const username = (me.username || '').toLowerCase();
    if (!igUserId || !username) {
      return htmlPage(
        'Connection failed',
        'Instagram did not return an account id/username for the authorized account.',
        false
      );
    }

    const supabase = svc();
    const now = new Date().toISOString();

    // 3. dept registry row this link was issued for
    const { data: dept } = await supabase
      .from('social_dept_accounts')
      .select('id, username, institution_id, department_id, ig_account_id')
      .eq('id', verified.deptAccountId)
      .maybeSingle();
    if (!dept) {
      return htmlPage(
        'Invalid connect link',
        'This connect link refers to a department record that no longer exists. Ask the administrator for a fresh link.',
        false
      );
    }

    // SECURITY: connect links are shareable, so the signed state is not a
    // secret — the ONLY thing binding the authorized Instagram account to
    // the department slot is this check. Reject (never warn-and-store) when
    // a different account was authorized, or an attacker holding a link
    // issued for @dept could bind their own account to the department.
    if (username !== dept.username.toLowerCase()) {
      return htmlPage(
        'Wrong Instagram account',
        `This connect link is for <strong>@${escapeHtml(
          dept.username
        )}</strong>, but <strong>@${escapeHtml(
          me.username || ''
        )}</strong> was authorized. Log into the correct Instagram account and open the link again (or ask the admin to update the registered handle first).`,
        false
      );
    }

    // 4. find-or-create the monitored ig_accounts row. ig_accounts.username
    //    has NO unique constraint, so single-row helpers are unsafe here —
    //    match by ig_user_id first (the upsert conflict key), then by
    //    username via limit(1) (oldest row wins, deterministic).
    let igAccountId: string | null = null;
    const { data: byId } = await supabase
      .from('ig_accounts')
      .select('id')
      .eq('ig_user_id', igUserId)
      .limit(1);
    igAccountId = byId?.[0]?.id ?? null;
    if (!igAccountId) {
      const { data: byName } = await supabase
        .from('ig_accounts')
        .select('id')
        .ilike('username', username)
        .order('created_at', { ascending: true })
        .limit(1);
      igAccountId = byName?.[0]?.id ?? null;
    }

    if (igAccountId) {
      await supabase
        .from('ig_accounts')
        .update({ metrics_source: 'instagram_login', updated_at: now })
        .eq('id', igAccountId);
    } else if (dept.institution_id) {
      const { data: created } = await supabase
        .from('ig_accounts')
        .upsert(
          {
            institution_id: dept.institution_id,
            department_id: dept.department_id,
            ig_user_id: igUserId,
            username: me.username,
            account_type: me.account_type || 'BUSINESS',
            status: 'active',
            metrics_source: 'instagram_login',
            updated_at: now,
          },
          { onConflict: 'ig_user_id', ignoreDuplicates: false }
        )
        .select('id')
        .maybeSingle();
      igAccountId = created?.id ?? null;
    }
    // If neither matched nor creatable (no institution mapping), the
    // connection is still stored — the poller skips metrics until an
    // ig_accounts link exists.

    // 5. store the connection (one per IG account)
    const { error: connErr } = await supabase.from('ig_account_connections').upsert(
      {
        dept_account_id: dept?.id ?? null,
        ig_account_id: igAccountId,
        ig_user_id: igUserId,
        username: me.username,
        access_token: longToken.access_token,
        token_type: longToken.token_type || 'bearer',
        scopes: shortToken.permissions ?? null,
        expires_at: expiresAt,
        connected_at: now,
        status: 'active',
        last_error: null,
        updated_at: now,
      },
      { onConflict: 'ig_user_id', ignoreDuplicates: false }
    );
    if (connErr) {
      console.error('[social/instagram] callback connection upsert failed:', connErr.message);
      return htmlPage(
        'Connection failed',
        'The authorization succeeded but saving it failed. Please tell the administrator to check the server logs.',
        false
      );
    }

    // 6. flip the registry row's Monitored link
    if (dept && igAccountId && dept.ig_account_id !== igAccountId) {
      await supabase
        .from('social_dept_accounts')
        .update({ ig_account_id: igAccountId, updated_at: now })
        .eq('id', dept.id);
    }

    return htmlPage(
      `@${me.username} connected`,
      `Instagram insights for <strong>@${escapeHtml(
        me.username || ''
      )}</strong> are now linked to MyJKKN. You can close this tab.`,
      true
    );
  } catch (e) {
    // Detail goes to server logs only — this page is public and Meta error
    // strings can echo request fragments.
    const msg =
      e instanceof IgLoginError ? e.message : e instanceof Error ? e.message : 'unknown error';
    console.error('[social/instagram] callback failed:', msg);
    return htmlPage(
      'Connection failed',
      'Could not complete the Instagram connection. You can close this tab and try again from a fresh connect link — if it keeps failing, tell the administrator to check the server logs.',
      false
    );
  }
}
