/**
 * The bug-intake key check for POST /api/v1/public/bug-reports.
 *
 * The key is PUBLIC — it sits in the browser of every visitor of the college
 * app — so it establishes WHICH APP is calling and nothing else. Only a live
 * key of kind 'bug_intake' (migration 20271010151437) linked to an active
 * sibling app is accepted. Admin keys (jkkn_…), personal keys (jkkn_pk_…) and
 * anything else without the jkkn_bi_ prefix are refused before any lookup.
 *
 * The rate limit runs BEFORE any database lookup, per caller IP across every
 * key, so a flood of made-up jkkn_bi_ keys never reaches the database
 * unthrottled. It is in-memory per server instance; the shared cap is the
 * per-app daily count the POST checks in the database.
 */
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { intakeCorsHeaders } from '@/lib/bug-reports/sibling-intake';

/**
 * The caller's IP as the platform saw it. On Vercel, x-vercel-forwarded-for
 * and x-forwarded-for are set at the edge, which overwrites any value the
 * client sent (Vercel docs, "Request headers"; not re-verified live). The
 * first entry is used. If a proxy is ever put in front of Vercel, revisit this.
 */
export function intakeClientIp(request: Request): string | null {
  for (const name of ['x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip']) {
    const first = request.headers.get(name)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return null;
}

/** The SDK's failure envelope; the SDK shows error.message in its toast. */
export function intakeFail(
  code: string,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { ...intakeCorsHeaders, ...extraHeaders } }
  );
}

export type SiblingApp = { id: string; slug: string; name: string };

export type IntakeAuth =
  | {
      ok: true;
      keyId: string;
      app: SiblingApp;
      supabase: ReturnType<typeof createServiceRoleClient>;
    }
  | { ok: false; response: NextResponse };

export async function authenticateIntakeKey(
  request: Request,
  opts: { rateLimitBucket: string; rateLimitedMessage: string; ipAddress: string | null }
): Promise<IntakeAuth> {
  // ── Key: present, the bug-intake shape, and a live bug_intake row ────────
  const apiKey = (request.headers.get('x-api-key') ?? '').trim();
  if (!apiKey) {
    return {
      ok: false,
      response: intakeFail('UNAUTHORIZED', 'API key is required. Send it in the X-API-Key header.', 401),
    };
  }
  if (!apiKey.startsWith('jkkn_bi_')) {
    // Admin keys (jkkn_…), personal keys (jkkn_pk_…) and anything else: no
    // lookup at all. Only a bug-intake key may be used from a browser.
    return {
      ok: false,
      response: intakeFail('UNAUTHORIZED', 'This endpoint accepts only a bug-intake key.', 401),
    };
  }

  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

  // ── Rate limit, before any lookup: per caller IP across all keys. A caller
  // with no IP (never on Vercel) is limited per key, not in one shared bucket.
  const caller = opts.ipAddress ? `ip:${opts.ipAddress}` : `key:${hashedKey.slice(0, 16)}`;
  const rate = checkRateLimit(`${opts.rateLimitBucket}:${caller}`);
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000));
    return {
      ok: false,
      response: intakeFail('RATE_LIMITED', opts.rateLimitedMessage, 429, {
        'Retry-After': String(retryAfter),
      }),
    };
  }

  const supabase = createServiceRoleClient();

  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('id, is_active, expires_at, key_kind, sibling_app_id')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .maybeSingle();

  if (keyError || !keyRow) {
    return { ok: false, response: intakeFail('UNAUTHORIZED', 'Invalid or inactive API key.', 401) };
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return { ok: false, response: intakeFail('UNAUTHORIZED', 'API key has expired.', 401) };
  }
  if (keyRow.key_kind !== 'bug_intake' || !keyRow.sibling_app_id) {
    return { ok: false, response: intakeFail('FORBIDDEN', 'This key cannot submit bug reports.', 403) };
  }

  const { data: app, error: appError } = await supabase
    .from('sibling_apps')
    .select('id, slug, name, is_active')
    .eq('id', keyRow.sibling_app_id)
    .maybeSingle();

  if (appError || !app || app.is_active !== true) {
    return {
      ok: false,
      response: intakeFail('FORBIDDEN', 'The app this key belongs to is not accepting bug reports.', 403),
    };
  }

  return {
    ok: true,
    keyId: keyRow.id as string,
    app: { id: app.id as string, slug: app.slug as string, name: app.name as string },
    supabase,
  };
}
