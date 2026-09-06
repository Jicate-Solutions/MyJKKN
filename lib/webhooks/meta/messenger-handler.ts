/**
 * lib/webhooks/meta/messenger-handler.ts
 *
 * Pure handler for a single Meta Page webhook entry containing Messenger
 * `messaging` events. Extracted from the original
 * `app/api/webhooks/meta/messenger/route.ts` POST body so multiple route
 * shims can share the same processing logic.
 *
 * The handler is idempotent against duplicate `mid` (Meta retries forever)
 * via the unique constraint on `messenger_messages.mid` (Postgres 23505 is
 * swallowed as success).
 *
 * HMAC verification, policy reads (is_enabled), and waitUntil scheduling
 * stay in the route layer — this module assumes the caller has already
 * decided the event should be persisted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessengerEntry,
  MessengerEvent,
} from '@/lib/messenger/types';

export async function handleMessengerEvent(
  entry: MessengerEntry,
  supabase: SupabaseClient
): Promise<{ ok: true }> {
  for (const event of entry.messaging || []) {
    try {
      await processEvent(supabase, entry, event);
    } catch (err) {
      logger.error('meta/messenger-handler', 'Failed to process event', {
        pageId: entry.id,
        senderId: event.sender?.id,
        error: String(err),
      });
    }
  }
  return { ok: true };
}

async function processEvent(
  supabase: SupabaseClient,
  entry: MessengerEntry,
  event: MessengerEvent
): Promise<void> {
  if (!event.message) {
    // Postbacks / deliveries / reads not persisted in Phase 1. Log for visibility.
    logger.info('meta/messenger-handler', 'Non-message event skipped', {
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

  // Resolve institution_id for the (page_id). Phase 1 falls back to the first
  // institution if no conversation row yet exists; Director can re-map later.
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
      logger.info('meta/messenger-handler', 'Duplicate mid — already persisted', {
        mid: event.message.mid,
      });
      return;
    }
    throw msgErr;
  }

  logger.info('meta/messenger-handler', 'Persisted messenger event', {
    pageId,
    psid,
    direction,
    mid: event.message.mid,
  });
}
