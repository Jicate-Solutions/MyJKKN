export const dynamic = 'force-dynamic';

/**
 * @deprecated Meta only allows 1 callback URL per Page product. The
 * App-level Page subscription points at `/api/webhooks/meta/messenger`,
 * which now dispatches by `changes[].field` so leadgen events arriving
 * there are routed correctly. This route remains for backward-compat
 * with any external test/probe that POSTs directly to /leadgen — it
 * uses the same dispatcher so behavior is identical.
 *
 * /api/webhooks/meta/leadgen
 * Meta Lead Ads webhook receiver. Pairs with:
 *   - lib/meta/lead-ads-client.ts       (Graph API fetch)
 *   - lib/services/admission/meta-lead-importer.ts (lead → CRM)
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import { getLead } from '@/lib/meta/lead-ads-client';
import { importMetaLead } from '@/lib/services/admission/meta-lead-importer';
import { dispatchPageWebhook } from '@/lib/webhooks/meta/page-dispatcher';

// =============================================================================
// Service-role Supabase client (webhook has no user session)
// =============================================================================

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase service role credentials');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// Policy helpers — reads via fn_get_policy_*
// =============================================================================

async function readVerifyToken(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.rpc('fn_get_policy_text', {
    p_key: 'meta.leadgen.verify_token',
    p_default: '',
    p_scope_id: null,
  });
  if (error) {
    logger.warn('meta/leadgen-webhook', 'fn_get_policy_text(verify_token) errored', {
      error: error.message,
    });
    return null;
  }
  const v = typeof data === 'string' ? data : '';
  return v.length > 0 ? v : null;
}

async function readSigningSecret(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.rpc('fn_get_policy_text', {
    p_key: 'meta.leadgen.signing_secret_key',
    p_default: 'META_APP_SECRET',
    p_scope_id: null,
  });
  if (error) {
    logger.warn('meta/leadgen-webhook', 'fn_get_policy_text(signing_secret_key) errored', {
      error: error.message,
    });
    return null;
  }
  const envKey = typeof data === 'string' && data.length > 0 ? data : 'META_APP_SECRET';
  const secret = process.env[envKey];
  return secret && secret.length > 0 ? secret : null;
}

async function readIsEnabled(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('fn_get_policy_bool', {
    p_key: 'meta.leadgen.is_enabled',
    p_default: false,
    p_scope_id: null,
  });
  if (error) return false;
  return Boolean(data);
}

// =============================================================================
// HMAC-SHA256 signature verification (Meta App Secret)
// =============================================================================

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string | null): boolean {
  if (!secret) {
    logger.warn('meta/leadgen-webhook', 'No signing secret configured — rejecting in prod');
    return false;
  }
  if (!signatureHeader) {
    logger.warn('meta/leadgen-webhook', 'Missing X-Hub-Signature-256 header');
    return false;
  }

  const expectedSig = signatureHeader.replace('sha256=', '');
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf-8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(computedSig, 'hex')
    );
  } catch {
    return false;
  }
}

// =============================================================================
// GET — Meta Webhook Verification (challenge-response handshake)
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  let verifyToken: string | null = null;
  try {
    verifyToken = await readVerifyToken(getServiceClient());
  } catch (err) {
    logger.error('meta/leadgen-webhook', 'verify_token policy read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    logger.info('meta/leadgen-webhook', 'Webhook verification succeeded');
    return new NextResponse(challenge ?? '', { status: 200 });
  }

  logger.warn('meta/leadgen-webhook', 'Webhook verification failed', {
    mode,
    tokenMatch: Boolean(verifyToken) && token === verifyToken,
  });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// =============================================================================
// POST — Receive Meta leadgen events (backward-compat shim — uses dispatcher)
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const db = getServiceClient();

  // 1. HMAC signature verification.
  const signingSecret = await readSigningSecret(db);
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature, signingSecret)) {
    logger.warn('meta/leadgen-webhook', 'Invalid webhook signature — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse JSON.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error('meta/leadgen-webhook', 'Failed to parse webhook JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const p = payload as { object?: string } | null;
  if (!p || p.object !== 'page') {
    logger.info('meta/leadgen-webhook', 'Ignoring non-page event', {
      object: p?.object,
    });
    return NextResponse.json({ received: true });
  }

  // 3. Persist raw rows synchronously via the shared dispatcher. The
  //    dispatcher returns the extracted leadgen values so we can hand them
  //    to the importer below — keeping the existing hydration behavior.
  let leadgenValues: Array<{ leadgen_id: string }> = [];
  try {
    const result = await dispatchPageWebhook(payload, db);
    leadgenValues = result.leadgenValues;
    logger.info('meta/leadgen-webhook', 'Dispatched legacy /leadgen entries', {
      dispatched: result.dispatched,
      leadgenCount: leadgenValues.length,
    });
  } catch (err) {
    logger.error('meta/leadgen-webhook', 'dispatchPageWebhook threw', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Respond 200 immediately. Importer runs in background.
  const response = NextResponse.json({ received: true }, { status: 200 });

  const isEnabled = await readIsEnabled(db);
  if (!isEnabled) {
    logger.info('meta/leadgen-webhook', 'meta.leadgen.is_enabled=false — importer skipped', {
      pendingCount: leadgenValues.length,
    });
    return response;
  }

  // Standard Meta token env fallback chain — mirrors
  // app/api/admin/social/lead-ads/forms (#1282 follow-up). Previously the
  // webhook hard-required META_LEAD_ADS_PAGE_ACCESS_TOKEN and silently
  // skipped hydration when only a sibling token was configured.
  const pageAccessToken =
    process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN ||
    process.env.META_IG_SYSTEM_USER_TOKEN ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    undefined;
  if (!pageAccessToken) {
    logger.warn(
      'meta/leadgen-webhook',
      'No Meta access token in env (META_LEAD_ADS_PAGE_ACCESS_TOKEN / META_IG_SYSTEM_USER_TOKEN / ' +
        'MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN) — cannot hydrate leads'
    );
    return response;
  }

  const processAll = async () => {
    for (const value of leadgenValues) {
      try {
        await importMetaLead(
          { event: value as unknown as Parameters<typeof importMetaLead>[0]['event'] },
          {
            supabaseService: db,
            fetchLead: (leadgenId) =>
              getLead(leadgenId, { accessToken: pageAccessToken }),
          }
        );
      } catch (err) {
        logger.error('meta/leadgen-webhook', 'importMetaLead threw unexpectedly', {
          leadgenId: value.leadgen_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(processAll());
  } catch {
    await processAll();
  }

  return response;
}
