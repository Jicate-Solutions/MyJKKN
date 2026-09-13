// lib/services/whatsapp/whatsapp-personal-queue-service.ts
// Processes wa_personal_message_queue — hands 'personal' items to the campus
// WhatsApp bridge outbox, or sends 'meta_waba' items through the Meta API.
//
// 2026-09-13 — repointed off the Railway whatsapp-web.js service. The personal
// channel no longer performs a send: it enqueues into `wa_bridge_outbox`, which
// the on-campus Go bridge drains. So for a 'personal' item, `status = 'sent'`
// now means HANDED OFF to the bridge, not confirmed delivered — the bridge owns
// the delivery outcome from that point on. ('meta_waba' items are unchanged and
// still mean actually sent.)

import { createClient } from '@supabase/supabase-js';
import { WhatsAppPersonalMessageService } from './whatsapp-personal-message-service';
import {
  personalSendMessageAPI,
  resolveHistoryAnchor,
  normalizeToE164,
} from '@/lib/whatsapp/personal-api-client';
import {
  sendTemplateMessage,
  isWhatsAppConfigured,
} from '@/lib/services/whatsapp/whatsapp-api-client';
import type { PersonalMessageQueueItem } from '@/types/whatsapp-personal';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MAX_RETRIES = 3;
const PERSONAL_WA_DAILY_LIMIT = 200; // Safety limit for personal WA

// `toJID` used to live here and appended '@c.us'. It is gone: the bridge takes
// canonical E.164 DIGITS ONLY, and `normalizeToE164` in personal-api-client.ts
// is the single place that decides the wire format.

/**
 * Correlation key written to BOTH `wa_personal_message_queue.wa_message_id` and
 * `wa_personal_message_logs.whatsapp_message_id` when an item is handed to the
 * bridge. The prefix keeps it unmistakable: this is an OUTBOX ROW ID, not a
 * WhatsApp message id — no WhatsApp id exists until the bridge actually sends.
 */
const OUTBOX_REF_PREFIX = 'outbox:';
function outboxRef(outboxId: string): string {
  return `${OUTBOX_REF_PREFIX}${outboxId}`;
}

/** Format phone for Meta WABA (no @c.us, no +) */
function toWABA(phone: string): string {
  let clean = phone.replace(/[\s\-()@c.us+]/g, '');
  if (clean.startsWith('0')) clean = '91' + clean.slice(1);
  else if (/^[6-9]\d{9}$/.test(clean)) clean = '91' + clean;
  return clean;
}

export class WhatsAppPersonalQueueService {
  /**
   * Process pending queue items. Called by cron or API route.
   * Groups by department, checks connections, sends or retries.
   */
  static async processQueue(limit: number = 50): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    /** Handed-off items the bridge has since reported as terminally failed. */
    reflected: number;
  }> {
    const supabase = getServiceClient();
    const now = new Date().toISOString();
    let sent = 0, failed = 0, skipped = 0;

    // Before queueing anything new, pull terminal bridge failures back in. An
    // item handed to the outbox is marked 'sent'; without this pass a lead the
    // bridge could never reach stays recorded as contacted forever.
    const reflected = await this.reconcileBridgeAcks(supabase, limit);

    // Fetch pending items ready for processing
    const { data: pending } = await supabase
      .from('wa_personal_message_queue')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lt('retry_count', MAX_RETRIES)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!pending || pending.length === 0) {
      return { processed: 0, sent: 0, failed: 0, skipped: 0, reflected };
    }

    // Check consent for all leads in batch
    const leadIds = [...new Set(pending.map((p: any) => p.lead_id))];
    const { data: leads } = await supabase
      .from('admission_leads')
      .select('id, wa_opt_in')
      .in('id', leadIds);
    const consentMap = new Map((leads || []).map((l: any) => [l.id, l.wa_opt_in]));

    // Check daily personal WA send count
    const today = new Date().toISOString().split('T')[0];
    const { count: todaySentCount } = await supabase
      .from('wa_personal_message_queue')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'personal')
      .eq('status', 'sent')
      .gte('created_at', `${today}T00:00:00.000Z`);

    let personalSentToday = todaySentCount ?? 0;

    for (const item of pending as PersonalMessageQueueItem[]) {
      // Skip if consent revoked
      if (!consentMap.get(item.lead_id)) {
        await supabase
          .from('wa_personal_message_queue')
          .update({ status: 'skipped', error_message: 'consent_revoked' })
          .eq('id', item.id);
        skipped++;
        continue;
      }

      if (item.channel === 'personal') {
        // Check personal daily limit
        if (personalSentToday >= PERSONAL_WA_DAILY_LIMIT) {
          await supabase
            .from('wa_personal_message_queue')
            .update({
              status: 'skipped',
              error_message: 'personal_daily_limit_reached',
            })
            .eq('id', item.id);
          skipped++;
          continue;
        }

        const result = await this.sendViaPersonal(item);
        if (result.success) {
          // 'sent' here means HANDED OFF to the campus bridge outbox. The bridge
          // owns delivery from this point; wa_message_id stays null until it
          // reports one back.
          await supabase
            .from('wa_personal_message_queue')
            .update({
              status: 'sent',
              // NOT a WhatsApp message id — none exists until the bridge sends.
              // This is the outbox row id, prefixed so its meaning is explicit,
              // and it is how reconcileBridgeAcks finds this item again.
              wa_message_id: result.outboxId ? outboxRef(result.outboxId) : null,
              sent_at: new Date().toISOString(),
              department_id: result.departmentId,
            })
            .eq('id', item.id);
          personalSentToday++;
          sent++;
        } else {
          await this.handleFailure(supabase, item, result.error || 'Send failed');
          failed++;
        }
      } else if (item.channel === 'meta_waba') {
        const result = await this.sendViaWABA(item);
        if (result.success) {
          await supabase
            .from('wa_personal_message_queue')
            .update({
              status: 'sent',
              wa_message_id: result.messageId,
              sent_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          sent++;
        } else {
          await this.handleFailure(supabase, item, result.error || 'WABA send failed');
          failed++;
        }
      }

      // The 2-4s anti-detection jitter that used to sit here is gone: this loop
      // no longer sends, it only enqueues. Pacing between actual WhatsApp sends
      // is the campus bridge's job now, and sleeping here would only stretch the
      // cron run.
    }

    return { processed: pending.length, sent, failed, skipped, reflected };
  }

  /**
   * Hand a personal-channel item to the campus bridge outbox.
   *
   * No longer requires a 'ready' wa_personal_connections row: there is one
   * shared JKKN number and nothing marks those rows ready now that transport
   * left this process. The outbox IS the queue — a bridge that is temporarily
   * offline drains the backlog when it returns, so we enqueue regardless of the
   * current heartbeat rather than failing the item into retry.
   */
  private static async sendViaPersonal(
    item: PersonalMessageQueueItem
  ): Promise<{
    success: boolean;
    outboxId?: string;
    departmentId?: string;
    error?: string;
  }> {
    try {
      const phone = normalizeToE164(item.phone);

      const result = await personalSendMessageAPI(phone, item.message_content, {
        leadId: item.lead_id,
        institutionId: item.institution_id ?? null,
        createdBy: null,
      });

      // History log — unchanged table. wa_personal_message_logs requires a
      // department_id and connection_id (both NOT NULL with FKs), so an
      // existing connection row is reused purely as history metadata.
      //
      // SCOPE: the anchor comes from the QUEUE ITEM's own department, never
      // from "whatever connection row sorts first". An item with no department
      // gets no history row — a row under the wrong department would publish
      // this message body and this phone number to staff of a department the
      // message never belonged to.
      const anchor = await resolveHistoryAnchor(item.department_id ?? null);
      if (anchor && result.id) {
        await WhatsAppPersonalMessageService.logMessage({
          department_id: anchor.department_id,
          connection_id: anchor.id,
          recipient_type: 'individual',
          recipient_phone: phone,
          message_content: item.message_content,
          lead_id: item.lead_id,
          sent_by: 'system',
          // Queued with the bridge; delivery is confirmed out of band.
          status: 'pending',
          // Correlation handle so a terminal `failed` ack can find this row.
          whatsapp_message_id: outboxRef(result.id),
        });
      }

      return {
        success: result.queued,
        outboxId: result.id,
        departmentId: anchor?.department_id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Reflect terminal bridge failures back into the queue and the message log.
   *
   * Handing an item to the outbox marked it 'sent' and nothing ever revisited
   * that, so a lead the bridge could never reach was recorded as contacted —
   * permanently, and invisibly. This pass finds items whose outbox row has since
   * gone terminal `failed` and routes them through the normal retry/backoff
   * path, so an unreachable recipient behaves like any other send failure.
   *
   * Idempotent: handleFailure moves the row off 'sent', so a row is only ever
   * reflected once.
   */
  private static async reconcileBridgeAcks(supabase: any, limit: number): Promise<number> {
    const { data: handedOff } = await supabase
      .from('wa_personal_message_queue')
      .select('*')
      .eq('channel', 'personal')
      .eq('status', 'sent')
      .like('wa_message_id', `${OUTBOX_REF_PREFIX}%`)
      .order('sent_at', { ascending: true })
      .limit(limit);

    if (!handedOff || handedOff.length === 0) return 0;

    const byOutboxId = new Map<string, PersonalMessageQueueItem>();
    for (const row of handedOff as PersonalMessageQueueItem[]) {
      const ref = row.wa_message_id;
      if (ref) byOutboxId.set(ref.slice(OUTBOX_REF_PREFIX.length), row);
    }

    const { data: outbox, error } = await supabase
      .from('wa_bridge_outbox')
      .select('id, status, error')
      .in('id', [...byOutboxId.keys()])
      .eq('status', 'failed');

    // A missing table or a revoked grant must not silently read as "nothing
    // failed" — leave the rows alone and let the next run try again.
    if (error || !outbox || outbox.length === 0) return 0;

    let reflected = 0;
    for (const row of outbox as { id: string; status: string; error: string | null }[]) {
      const item = byOutboxId.get(row.id);
      if (!item) continue;

      const reason = row.error || 'bridge reported a terminal failure';
      await this.handleFailure(supabase, item, reason);

      // Flip the matching history row too, so the lead timeline does not keep
      // showing a message that was never delivered as pending forever.
      await supabase
        .from('wa_personal_message_logs')
        .update({ status: 'failed', error_message: reason })
        .eq('whatsapp_message_id', outboxRef(row.id));

      reflected++;
    }
    return reflected;
  }

  /** Send via Meta WABA as fallback (text message, not template) */
  private static async sendViaWABA(
    item: PersonalMessageQueueItem
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!isWhatsAppConfigured()) {
      return { success: false, error: 'waba_not_configured' };
    }

    try {
      // Import sendTextMessage from the WABA client
      const { sendTextMessage } = await import('@/lib/services/whatsapp/whatsapp-api-client');
      const phone = toWABA(item.phone);
      const result = await sendTextMessage(phone, item.message_content);
      const messageId = result.messages?.[0]?.id;
      return { success: true, messageId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'WABA send error',
      };
    }
  }

  /** Handle send failure with exponential backoff */
  private static async handleFailure(
    supabase: any,
    item: PersonalMessageQueueItem,
    errorMsg: string
  ): Promise<void> {
    const retryCount = item.retry_count + 1;
    const backoffMinutes = Math.pow(2, retryCount) * 5; // 10min, 20min, 40min
    const nextRetry = new Date();
    nextRetry.setMinutes(nextRetry.getMinutes() + backoffMinutes);

    await supabase
      .from('wa_personal_message_queue')
      .update({
        status: retryCount >= MAX_RETRIES ? 'permanently_failed' : 'failed',
        retry_count: retryCount,
        next_retry_at: nextRetry.toISOString(),
        error_message: errorMsg,
      })
      .eq('id', item.id);
  }

  /** Get queue stats for monitoring */
  static async getQueueStats(institutionId?: string): Promise<{
    total: number;
    queued: number;
    sent: number;
    failed: number;
    permanently_failed: number;
    skipped: number;
  }> {
    const supabase = getServiceClient();
    let query = supabase
      .from('wa_personal_message_queue')
      .select('status');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    if (!data) return { total: 0, queued: 0, sent: 0, failed: 0, permanently_failed: 0, skipped: 0 };

    return {
      total: data.length,
      queued: data.filter((d: any) => d.status === 'queued').length,
      sent: data.filter((d: any) => d.status === 'sent').length,
      failed: data.filter((d: any) => d.status === 'failed').length,
      permanently_failed: data.filter((d: any) => d.status === 'permanently_failed').length,
      skipped: data.filter((d: any) => d.status === 'skipped').length,
    };
  }
}
