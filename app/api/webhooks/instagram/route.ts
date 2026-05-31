export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';

// =============================================================================
// Service-role Supabase client (webhook has no user session)
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// HMAC-SHA256 signature verification (Meta App Secret)
// Same pattern as the WhatsApp webhook at /api/webhooks/whatsapp/route.ts
// =============================================================================

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.INSTAGRAM_WEBHOOK_SECRET;
  if (!appSecret) {
    // Fail closed: an unverified POST can forge inbound Instagram events.
    // The secret MUST be set in every environment.
    logger.error('meta/ig-webhook', 'INSTAGRAM_WEBHOOK_SECRET not set — rejecting webhook');
    return false;
  }

  if (!signatureHeader) {
    logger.warn('meta/ig-webhook', 'Missing X-Hub-Signature-256 header');
    return false;
  }

  // Meta sends: sha256=<hex>
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

// =============================================================================
// GET — Meta Webhook Verification (challenge-response handshake)
// Meta calls GET with ?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
// We respond with the challenge value as plain text to confirm ownership.
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('meta/ig-webhook', 'Webhook verification succeeded');
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn('meta/ig-webhook', 'Webhook verification failed', {
    mode,
    tokenMatch: token === verifyToken,
  });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// =============================================================================
// POST — Receive Instagram webhook events from Meta
// Meta expects a 200 quickly; retries on non-200 causing event duplication.
// We verify the signature, acknowledge immediately, then process in background.
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for signature verification (must happen before .json())
  const rawBody = await request.text();

  // 2. Verify HMAC-SHA256 signature
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    logger.warn('meta/ig-webhook', 'Invalid webhook signature — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse JSON payload
  let payload: InstagramWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error('meta/ig-webhook', 'Failed to parse webhook JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 4. Validate it's an Instagram event (object="instagram")
  if (payload.object !== 'instagram') {
    logger.info('meta/ig-webhook', 'Ignoring non-Instagram event', { object: payload.object });
    return NextResponse.json({ received: true });
  }

  // 5. Acknowledge immediately — Meta retries if no 200 within 20s
  const response = NextResponse.json({ received: true }, { status: 200 });

  // 6. Process in background (Vercel waitUntil or sync fallback)
  const processEvents = async () => {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        try {
          await processChange(entry.id, change);
        } catch (err) {
          logger.error('meta/ig-webhook', 'Failed to process change', {
            igAccountId: entry.id,
            field: change.field,
            error: String(err),
          });
        }
      }
    }
  };

  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(processEvents());
  } catch {
    // Non-Vercel environment — process synchronously
    await processEvents();
  }

  return response;
}

// =============================================================================
// Event Routing — route by change.field to the appropriate log handler
// =============================================================================

async function processChange(igAccountId: string, change: InstagramChange): Promise<void> {
  const field = change.field;

  switch (field) {
    case 'comments':
      await logInstagramEvent(igAccountId, 'comment', field, change.value);
      break;

    case 'mentions':
      await logInstagramEvent(igAccountId, 'mention', field, change.value);
      break;

    case 'story_insights':
      await logInstagramEvent(igAccountId, 'story_insights', field, change.value);
      break;

    default:
      // Log unknown fields for debugging — avoids silent data loss
      logger.info('meta/ig-webhook', 'Unknown change field — logging as unknown', { field });
      await logInstagramEvent(igAccountId, 'unknown', field, change.value);
      break;
  }
}

// =============================================================================
// Log to social_instagram_logs
// Table created by Agent β migration. If table doesn't exist yet (pre-merge),
// the insert will runtime-error — that's expected and the error is caught above.
// =============================================================================

async function logInstagramEvent(
  igAccountId: string,
  eventType: string,
  field: string,
  value: unknown
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.from('social_instagram_logs').insert({
    ig_account_id: igAccountId,
    event_type: eventType,
    field,
    payload: value ?? null,
    received_at: new Date().toISOString(),
  });

  if (error) {
    logger.error('meta/ig-webhook', 'Failed to insert instagram log', {
      igAccountId,
      eventType,
      field,
      error: error.message,
    });
    throw error;
  }

  logger.info('meta/ig-webhook', 'Instagram event logged', {
    igAccountId,
    eventType,
    field,
  });
}

// =============================================================================
// Instagram Webhook Payload Types
// https://developers.facebook.com/docs/instagram-platform/webhooks
// =============================================================================

interface InstagramWebhookPayload {
  object: string;
  entry: InstagramEntry[];
}

interface InstagramEntry {
  /** Instagram Business Account ID */
  id: string;
  time?: number;
  changes: InstagramChange[];
}

interface InstagramChange {
  /** Subscription field that triggered this notification */
  field: string;
  /** Event-specific payload; shape varies by field */
  value: unknown;
}
