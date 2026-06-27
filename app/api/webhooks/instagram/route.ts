export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import { ingestFeedbackEvents } from '@/lib/services/feedback/feedback-ingest';
import type { FeedbackEventInput } from '@/lib/types/feedback-spine';

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
// Feedback Spine — ingest an IG comment into feedback_events.
//
// Mirrors the normalization used by the backfill adapter at
// app/api/cron/feedback-adapter-ig-comments/route.ts so dedup on
// (source='ig_comment', source_ref=comment_id) works across both paths.
//
// institution_id: resolved via ig_accounts.institution_id exactly like the
// adapter does (SELECT institution_id FROM ig_accounts WHERE id = igAccountId).
// If the account is not in ig_accounts (yet), institution_id is null — the
// row still lands in the spine; AI-classify runs later regardless.
//
// verb handling: 'add' or absent → ingest; 'edit' → ingest (dedup upsert keeps
// the latest content); 'remove' → skip (don't store deletions).
// =============================================================================

/** Narrow type for the Meta comments change.value payload. */
interface IgCommentValue {
  id: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
  parent_id?: string;
  timestamp?: string;
  verb?: string;
}

/**
 * Resolve institution_id from ig_accounts table given the IG Business Account ID.
 * Returns null (never throws) when the account is not found or the query fails.
 */
async function resolveInstitutionId(igAccountId: string): Promise<string | null> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('ig_accounts')
      .select('institution_id')
      .eq('id', igAccountId)
      .maybeSingle();
    return (data as { institution_id: string | null } | null)?.institution_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Normalize a Meta comments webhook payload into feedback_events via the spine.
 * Isolated try/catch: a spine failure MUST NOT break the 200 ack or
 * the social_instagram_logs insert that called us.
 */
async function ingestCommentToSpine(igAccountId: string, value: IgCommentValue): Promise<void> {
  try {
    // verb absent = 'add'; 'edit' updates via upsert idempotency; 'remove' = skip
    const verb = value.verb ?? 'add';
    if (verb === 'remove') {
      logger.info('meta/ig-webhook', 'Skipping removed comment — not ingested into spine', {
        commentId: value.id,
      });
      return;
    }

    // Skip empty/whitespace-only comments (nothing for AI-classify to work with)
    const content = value.text?.trim() ?? null;

    const institutionId = await resolveInstitutionId(igAccountId);

    const input: FeedbackEventInput = {
      source: 'ig_comment',
      source_ref: value.id,
      institution_id: institutionId,
      actor_type: 'ig_user',
      actor_ref: value.from?.username ?? value.from?.id ?? null,
      target_type: 'ig_post',
      target_ref: value.media?.id ?? null,
      event_type: 'comment',
      content,
      raw: value as unknown as Record<string, unknown>,
      ...(value.timestamp ? { occurred_at: value.timestamp } : {}),
    };

    const result = await ingestFeedbackEvents([input]);
    logger.info('meta/ig-webhook', 'IG comment ingested into feedback spine', {
      commentId: value.id,
      institutionId,
      verb,
      inserted: result.inserted,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    // Spine failure is non-fatal — the social_instagram_logs insert is the
    // primary audit trail; the spine is additive.
    logger.error('meta/ig-webhook', 'Failed to ingest comment into feedback spine', {
      commentId: value.id,
      error: String(err),
    });
  }
}

// =============================================================================
// Event Routing — route by change.field to the appropriate log handler
// =============================================================================

async function processChange(igAccountId: string, change: InstagramChange): Promise<void> {
  const field = change.field;

  switch (field) {
    case 'comments': {
      // 1. Keep existing debug trail (social_instagram_logs)
      await logInstagramEvent(igAccountId, 'comment', field, change.value);
      // 2. Additionally normalize into the feedback spine (non-fatal on failure)
      await ingestCommentToSpine(igAccountId, change.value as IgCommentValue);
      break;
    }

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
