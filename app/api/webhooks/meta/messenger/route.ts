export const dynamic = 'force-dynamic';

/**
 * /api/webhooks/meta/messenger
 *
 * Facebook Messenger Platform webhook receiver. Two methods:
 *
 *   GET  — Meta verification challenge. Compares ?hub.verify_token to the
 *          `meta.messenger.verify_token` row in platform_policies, echoes
 *          ?hub.challenge on match.
 *
 *   POST — Event delivery. Verifies the X-Hub-Signature-256 HMAC against the
 *          Meta App Secret, ACKs 200 immediately, then persists each event in
 *          the background via `waitUntil`. We persist BOTH directions —
 *          inbound (user→page) and echoes of outbound (page→user, is_echo).
 *
 * Module killswitch: when platform_policies.meta.messenger.is_enabled is
 * false, we still verify + ACK (Meta retries forever on non-200), but skip
 * persistence so the inbox stays empty until Director enables.
 *
 * Sibling pattern: `/api/webhooks/instagram/route.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessengerEntry,
  MessengerEvent,
  MessengerWebhookPayload,
} from '@/lib/messenger/types';

// ---------------------------------------------------------------------------
// Service-role Supabase client (webhook has no user session)
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ServiceClient = ReturnType<typeof getServiceClient>;

// ---------------------------------------------------------------------------
// Policy helpers — read verify_token + is_enabled from platform_policies
// ---------------------------------------------------------------------------

async function getPolicyJson(supabase: ServiceClient, key: string): Promise<unknown> {
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

async function loadVerifyToken(supabase: ServiceClient): Promise<string | null> {
  const v = await getPolicyJson(supabase, 'meta.messenger.verify_token');
  return typeof v === 'string' ? v : null;
}

async function loadIsEnabled(supabase: ServiceClient): Promise<boolean> {
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
    // unverified POST can forge inbound Messenger events. The secret MUST be
    // set in every environment (tests should inject it, not rely on a bypass).
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

  let supabase: ServiceClient;
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
// POST — Receive Messenger webhook events from Meta
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    logger.warn('meta/messenger-webhook', 'Invalid webhook signature — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: MessengerWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MessengerWebhookPayload;
  } catch {
    logger.error('meta/messenger-webhook', 'Failed to parse webhook JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.object !== 'page') {
    logger.info('meta/messenger-webhook', 'Ignoring non-page event', {
      object: payload.object,
    });
    return NextResponse.json({ received: true });
  }

  const response = NextResponse.json({ received: true }, { status: 200 });

  const processEvents = async () => {
    let supabase: ServiceClient;
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
        { entryCount: payload.entry?.length ?? 0 }
      );
      return;
    }

    for (const entry of payload.entry || []) {
      for (const event of entry.messaging || []) {
        try {
          await processEvent(supabase, entry, event);
        } catch (err) {
          logger.error('meta/messenger-webhook', 'Failed to process event', {
            pageId: entry.id,
            senderId: event.sender?.id,
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
    await processEvents();
  }

  return response;
}

// ---------------------------------------------------------------------------
// Event handler — upsert conversation, insert message, advance timestamps
// ---------------------------------------------------------------------------

async function processEvent(
  supabase: ServiceClient,
  entry: MessengerEntry,
  event: MessengerEvent
): Promise<void> {
  if (!event.message) {
    // Postbacks / deliveries / reads not persisted in Phase 1. Log for visibility.
    logger.info('meta/messenger-webhook', 'Non-message event skipped', {
      pageId: entry.id,
      hasPostback: !!event.postback,
      hasDelivery: !!event.delivery,
      hasRead: !!event.read,
    });
    return;
  }

  const pageId = entry.id;
  const isEcho = event.message.is_echo === true;
  const direction: 'in' | 'out' = isEcho ? 'out' : 'in';

  // For inbound: sender = user PSID, recipient = page.
  // For echo:    sender = page, recipient = user PSID.
  const psid = isEcho ? event.recipient.id : event.sender.id;
  const eventTimestamp = new Date(event.timestamp || Date.now()).toISOString();

  // Resolve institution_id for the (page_id). For Phase 1 we look up an
  // existing conversation row first; if none exists we need a Page→Institution
  // mapping. Until that lands (Director onboards a Page), we route to the
  // first institution as a fallback so events still persist visibly. Director
  // will edit the row's institution_id once page-mapping ships.
  const { data: existing } = await supabase
    .from('messenger_conversations')
    .select('id, institution_id, last_inbound_at, last_outbound_at')
    .eq('page_id', pageId)
    .eq('psid', psid)
    .maybeSingle();

  let conversationId: string;

  if (existing) {
    conversationId = existing.id;
    const patch: Record<string, unknown> = { status: 'open' };
    if (direction === 'in') patch.last_inbound_at = eventTimestamp;
    else patch.last_outbound_at = eventTimestamp;

    const { error: updateErr } = await supabase
      .from('messenger_conversations')
      .update(patch)
      .eq('id', conversationId);
    if (updateErr) throw updateErr;
  } else {
    // Pick a fallback institution. Director-only mapping table comes later.
    const { data: anyInstitution, error: instErr } = await supabase
      .from('institutions')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (instErr || !anyInstitution) {
      throw new Error(
        'No institution available to scope new messenger conversation'
      );
    }

    const insertRow: Record<string, unknown> = {
      institution_id: anyInstitution.id,
      page_id: pageId,
      psid,
      status: 'open',
    };
    if (direction === 'in') insertRow.last_inbound_at = eventTimestamp;
    else insertRow.last_outbound_at = eventTimestamp;

    const { data: created, error: createErr } = await supabase
      .from('messenger_conversations')
      .insert(insertRow)
      .select('id')
      .single();
    if (createErr) throw createErr;
    conversationId = created.id;
  }

  const { error: msgErr } = await supabase.from('messenger_messages').insert({
    conversation_id: conversationId,
    direction,
    mid: event.message.mid ?? null,
    text: event.message.text ?? null,
    attachments: event.message.attachments ?? null,
    sent_at: eventTimestamp,
  });

  // Duplicate mid (Meta retries) — swallow as success.
  if (msgErr) {
    const code = (msgErr as { code?: string }).code;
    if (code === '23505') {
      logger.info('meta/messenger-webhook', 'Duplicate mid — already persisted', {
        mid: event.message.mid,
      });
      return;
    }
    throw msgErr;
  }

  logger.info('meta/messenger-webhook', 'Persisted messenger event', {
    pageId,
    psid,
    direction,
    mid: event.message.mid,
  });
}
