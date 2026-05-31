// =============================================================================
// /api/webhooks/meta/instagram-messaging — Phase 1B (Agent ι, 2026-05-30)
// =============================================================================
// SEPARATE webhook from /api/webhooks/instagram (Phase 1B comments) and
// SEPARATE from /api/webhooks/meta/messenger (Agent δ — FB Messenger).
//
// Subscribed to:
//   Meta App > Webhooks > Instagram > messages
//                                  > messaging_postbacks
//                                  > message_reactions
//
// Verify-token is read from platform_policies.meta.instagram_messaging.verify_token
// so Director can rotate it from the admin policy UI without a deploy.
// Webhook signature (X-Hub-Signature-256) is verified against
// INSTAGRAM_WEBHOOK_SECRET (Meta App Secret).
//
// All inbound writes go via service-role client (RLS-bypass) because Meta
// hits this endpoint with no Supabase session.
// =============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { IgDmEvent } from '@/lib/instagram/dm-types';

// =============================================================================
// Helpers
// =============================================================================

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.INSTAGRAM_WEBHOOK_SECRET;
  if (!appSecret) {
    // Fail closed: this receiver persists via the service-role client, so an
    // unverified POST can forge inbound IG DMs. The secret MUST be set in every
    // environment (inject it in tests rather than relying on a runtime bypass).
    console.error('[meta/ig-messaging] INSTAGRAM_WEBHOOK_SECRET not set — rejecting webhook');
    return false;
  }
  if (!signatureHeader) {
    console.warn('[meta/ig-messaging] Missing X-Hub-Signature-256 header');
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

async function readVerifyTokenFromPolicy(): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: 'meta.instagram_messaging.verify_token',
      p_scope_id: null,
    });
    if (error) {
      console.warn('[meta/ig-messaging] verify_token policy read failed:', error.message);
      return null;
    }
    return typeof data === 'string' ? data : null;
  } catch (err) {
    console.warn('[meta/ig-messaging] verify_token policy unreachable:', err);
    return null;
  }
}

// =============================================================================
// GET — Meta verify handshake
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token');
  const challenge = sp.get('hub.challenge');

  const expected = await readVerifyTokenFromPolicy();
  if (!expected) {
    return NextResponse.json({ error: 'Verify token not configured' }, { status: 500 });
  }

  if (mode === 'subscribe' && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// =============================================================================
// POST — Inbound message / postback / reaction events
// =============================================================================

interface IgMessagingPayload {
  object: string;
  entry?: IgDmEvent[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // 1. Signature verification (HMAC-SHA256 of raw body using App Secret)
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse
  let payload: IgMessagingPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Only instagram messaging events (object=instagram). FB Messenger is
  //    object=page and is handled by Agent δ's /api/webhooks/meta/messenger.
  if (payload.object !== 'instagram') {
    return NextResponse.json({ received: true });
  }

  // 4. Policy gate — master kill switch
  const supabase = createServiceRoleClient();
  const { data: isEnabledRaw } = await supabase.rpc('fn_get_policy', {
    p_key: 'ig.dm.is_enabled',
    p_scope_id: null,
  });
  if (isEnabledRaw === false) {
    // 200 so Meta doesn't retry; just no-op the body.
    return NextResponse.json({ received: true, skipped: true, reason: 'ig.dm.is_enabled=false' });
  }

  // 5. Ack early, process in background — Meta retries on non-200 within 20s.
  const response = NextResponse.json({ received: true }, { status: 200 });
  const processEvents = async () => {
    for (const entry of payload.entry || []) {
      try {
        await processIgMessagingEntry(entry);
      } catch (err) {
        console.error('[meta/ig-messaging] entry processing error', {
          igAccountIgUserId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        });
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

// =============================================================================
// Event processing — turn an IgDmEvent into ig_dm_conversations + ig_dm_messages
// =============================================================================

async function processIgMessagingEntry(entry: IgDmEvent): Promise<void> {
  const supabase = createServiceRoleClient();

  // Resolve our local ig_accounts row from the IG-side user id Meta sends in entry.id
  const { data: account } = await supabase
    .from('ig_accounts')
    .select('id, institution_id, ig_user_id')
    .eq('ig_user_id', entry.id)
    .single();

  if (!account) {
    console.warn('[meta/ig-messaging] inbound for unknown ig_user_id', entry.id);
    return;
  }

  for (const msg of entry.messaging || []) {
    // Echoes are our own outbound messages reflected back — skip; they were
    // already persisted at send time.
    if (msg.message?.is_echo) continue;

    // Identify direction. Sender == our IG user → outbound; else inbound.
    const ourIgUserId = account.ig_user_id;
    const isInbound = msg.sender.id !== ourIgUserId;
    const externalIgUserId = isInbound ? msg.sender.id : msg.recipient.id;

    // Upsert conversation
    const nowIso = new Date().toISOString();
    const sentAtIso = new Date(msg.timestamp).toISOString();

    const { data: existingConv } = await supabase
      .from('ig_dm_conversations')
      .select('id, last_inbound_at')
      .eq('ig_account_id', account.id)
      .eq('ig_user_id', externalIgUserId)
      .maybeSingle();

    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
      if (isInbound) {
        await supabase
          .from('ig_dm_conversations')
          .update({ last_inbound_at: sentAtIso, updated_at: nowIso })
          .eq('id', conversationId);
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('ig_dm_conversations')
        .insert({
          institution_id: account.institution_id,
          ig_account_id: account.id,
          ig_user_id: externalIgUserId,
          last_inbound_at: isInbound ? sentAtIso : null,
        })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        console.error('[meta/ig-messaging] conversation insert failed', insertErr?.message);
        continue;
      }
      conversationId = inserted.id;
    }

    // Persist message row (dedupe on mid)
    if (msg.message?.mid) {
      const mediaPayload = msg.message.attachments
        ? { attachments: msg.message.attachments }
        : null;
      await supabase
        .from('ig_dm_messages')
        .upsert(
          {
            conversation_id: conversationId,
            direction: isInbound ? 'in' : 'out',
            text: msg.message.text ?? null,
            media: mediaPayload,
            mid: msg.message.mid,
            sent_at: sentAtIso,
          },
          { onConflict: 'mid', ignoreDuplicates: true }
        );
    }

    // Postback / reaction events: log for diagnostic visibility; no row yet.
    if (msg.postback || msg.reaction) {
      console.info('[meta/ig-messaging] postback/reaction received', {
        conversationId,
        kind: msg.postback ? 'postback' : 'reaction',
      });
    }
  }
}
