/**
 * The bug-intake key check shared by every /api/v1/public/bug-reports route
 * (and the SDK's leaderboard route).
 *
 * The key is PUBLIC — it sits in the browser of every visitor of the college
 * app — so it establishes WHICH APP is calling and nothing else. Only a live
 * key of kind 'bug_intake' (migration 20271010151437) linked to an active
 * sibling app is accepted. Admin keys (jkkn_…), personal keys (jkkn_pk_…) and
 * anything else without the jkkn_bi_ prefix are refused before any lookup.
 *
 * Rate limiting is per key AND per caller (the key itself is shared by every
 * visitor). Reads use their own bucket so opening the "My bugs" drawer cannot
 * use up the 60-a-minute budget for filing a bug.
 */
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage } from '@/lib/api-keys/audit-logger';
import { intakeCorsHeaders } from '@/lib/bug-reports/sibling-intake';

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

/** The SDK's success envelope. */
export function intakeOk(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: intakeCorsHeaders });
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

  const supabase = createServiceRoleClient();
  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

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

  // ── Rate limit: per key AND per caller, since the key itself is public ───
  const rate = checkRateLimit(`${opts.rateLimitBucket}:${keyRow.id}:${opts.ipAddress ?? 'unknown'}`);
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000));
    return {
      ok: false,
      response: intakeFail('RATE_LIMITED', opts.rateLimitedMessage, 429, {
        'Retry-After': String(retryAfter),
      }),
    };
  }

  return {
    ok: true,
    keyId: keyRow.id as string,
    app: { id: app.id as string, slug: app.slug as string, name: app.name as string },
    supabase,
  };
}

/** Usage log line for a read, the same table the POST writes to. */
export function auditIntakeRead(entry: {
  keyId: string;
  endpoint: string;
  statusCode: number;
  startTime: number;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  logApiUsage({
    apiKeyId: entry.keyId,
    endpoint: entry.endpoint,
    module: 'bug-reports',
    institutionId: null,
    statusCode: entry.statusCode,
    responseTimeMs: Date.now() - entry.startTime,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
  });
}
