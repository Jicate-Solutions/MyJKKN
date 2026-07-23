export const dynamic = 'force-dynamic';

/**
 * /api/webhooks/meta/messenger
 *
 * Facebook Page webhook receiver — registered as the App-level callback URL
 * for the Page product. Because Meta allows only ONE callback URL per Page
 * product, this route receives BOTH `messaging` events (Messenger DMs,
 * postbacks, deliveries, reads) AND `changes[]` events (leadgen, feed, etc.).
 *
 * Routing by entry shape is delegated to `lib/webhooks/meta/page-dispatcher`:
 *   - entry.messaging[]                 → messenger-handler
 *   - entry.changes[].field=="leadgen"  → leadgen-handler
 *
 * Two methods:
 *
 *   GET  — Meta verification challenge. Compares ?hub.verify_token to the
 *          `meta.messenger.verify_token` row in platform_policies, echoes
 *          ?hub.challenge on match.
 *
 *   POST — Event delivery. Verifies the X-Hub-Signature-256 HMAC against the
 *          Meta App Secret, ACKs 200 immediately, then dispatches each entry
 *          in the background via `waitUntil`.
 *
 * Module killswitch: when platform_policies.meta.messenger.is_enabled is
 * false, we still verify + ACK (Meta retries forever on non-200), but skip
 * persistence so the inbox stays empty until Director enables.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import { dispatchPageWebhook } from '@/lib/webhooks/meta/page-dispatcher';

// ---------------------------------------------------------------------------
// Service-role Supabase client (webhook has no user session)
// ---------------------------------------------------------------------------

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Policy helpers — read verify_token + is_enabled from platform_policies
// ---------------------------------------------------------------------------

async function getPolicyJson(supabase: SupabaseClient, key: string): Promise<unknown> {
  const { data, error } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    logger.error('meta/messenger-webhook', 'platform_policies read failed', {
      key,
      error: error.message,
    });
    return undefined;
  }
  return data?.value;
}

async function loadVerifyToken(supabase: SupabaseClient): Promise<string | null> {
  const v = await getPolicyJson(supabase, 'meta.messenger.verify_token');
  return typeof v === 'string' ? v : null;
}

async function loadIsEnabled(supabase: SupabaseClient): Promise<boolean> {
  const v = await getPolicyJson(supabase, 'meta.messenger.is_enabled');
  return v === true;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 signature verification (Meta App Secret)
// Same pattern as the WhatsApp + Instagram webhook receivers.
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret =
    process.env.MESSENGER_WEBHOOK_SECRET || process.env.META_APP_SECRET;
  if (!appSecret) {
    // Fail closed: this receiver persists via the service-role client, so an
    // unverified POST can forge inbound Messenger events.
    logger.error(
      'meta/messenger-webhook',
      'MESSENGER_WEBHOOK_SECRET/META_APP_SECRET not set — rejecting webhook'
    );
    return false;
  }
  if (!signatureHeader) {
    logger.warn('meta/messenger-webhook', 'Missing X-Hub-Signature-256 header');
    return false;
  }

  const expectedSig = signatureHeader.replace('sha256=', '');
  const computedSig = crypto
    .createHmac('sha256', appSecret)
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

// ---------------------------------------------------------------------------
// GET — Meta Webhook Verification
// Meta calls: GET ?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    logger.error('meta/messenger-webhook', 'service client unavailable for GET', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const verifyToken = await loadVerifyToken(supabase);

  if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
    logger.info('meta/messenger-webhook', 'Webhook verification succeeded');
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn('meta/messenger-webhook', 'Webhook verification failed', {
    mode,
    tokenPresent: !!token,
    policyPresent: !!verifyToken,
  });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — Receive Page webhook events from Meta (messenger + changes mix)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    logger.warn('meta/messenger-webhook', 'Invalid webhook signature — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error('meta/messenger-webhook', 'Failed to parse webhook JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const p = payload as { object?: string; entry?: unknown[] } | null;
  if (!p || p.object !== 'page') {
    logger.info('meta/messenger-webhook', 'Ignoring non-page event', {
      object: p?.object,
    });
    return NextResponse.json({ received: true });
  }

  const response = NextResponse.json({ received: true }, { status: 200 });

  const processEvents = async () => {
    let supabase: SupabaseClient;
    try {
      supabase = getServiceClient();
    } catch (err) {
      logger.error('meta/messenger-webhook', 'service client unavailable', {
        error: String(err),
      });
      return;
    }

    const enabled = await loadIsEnabled(supabase);
    if (!enabled) {
      logger.info(
        'meta/messenger-webhook',
        'meta.messenger.is_enabled=false — ACK only, skipping persistence',
        { entryCount: p.entry?.length ?? 0 }
      );
      return;
    }

    try {
      const result = await dispatchPageWebhook(payload, supabase);
      logger.info('meta/messenger-webhook', 'Dispatched page webhook entries', {
        dispatched: result.dispatched,
        leadgenCount: result.leadgenValues.length,
      });
    } catch (err) {
      logger.error('meta/messenger-webhook', 'dispatchPageWebhook threw', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(processEvents());
  } catch {
    await processEvents();
  }

  return response;
}
