// lib/services/whatsapp/whatsapp-personal-queue-service.ts
// Processes wa_personal_message_queue — sends queued messages via personal WA or WABA fallback

import { createClient } from '@supabase/supabase-js';
import { WhatsAppPersonalConnectionService } from './whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from './whatsapp-personal-message-service';
import { personalSendMessageAPI } from '@/lib/whatsapp/personal-api-client';
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

/** Format phone for personal WA JID */
function toJID(phone: string): string {
  let clean = phone.replace(/[\s\-()@c.us]/g, '');
  if (clean.startsWith('+91')) clean = clean.slice(1);
  else if (clean.startsWith('0')) clean = '91' + clean.slice(1);
  else if (/^[6-9]\d{9}$/.test(clean)) clean = '91' + clean;
  return clean + '@c.us';
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
  }> {
    const supabase = getServiceClient();
    const now = new Date().toISOString();
    let sent = 0, failed = 0, skipped = 0;

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
      return { processed: 0, sent: 0, failed: 0, skipped: 0 };
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
          await supabase
            .from('wa_personal_message_queue')
            .update({
              status: 'sent',
              wa_message_id: result.messageId,
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

      // Add random delay between sends (2-4 seconds) to avoid detection
      if (item.channel === 'personal') {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
      }
    }

    return { processed: pending.length, sent, failed, skipped };
  }

  /** Send via personal WhatsApp (BYOW) */
  private static async sendViaPersonal(
    item: PersonalMessageQueueItem
  ): Promise<{ success: boolean; messageId?: string; departmentId?: string; error?: string }> {
    const connection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
    if (!connection || connection.status !== 'ready') {
      return { success: false, error: 'no_personal_connection' };
    }

    try {
      const jid = toJID(item.phone);
      const clientId = connection.client_id || `dept-${connection.department_id}`;
      const serviceUrl = connection.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

      const result = await personalSendMessageAPI(jid, item.message_content, {
        serviceUrl: `${serviceUrl}/clients/${clientId}`,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      if (result.success) {
        // Log to personal message logs for audit
        await WhatsAppPersonalMessageService.logMessage({
          department_id: connection.department_id,
          connection_id: connection.id,
          recipient_type: 'individual',
          recipient_phone: jid,
          message_content: item.message_content,
          lead_id: item.lead_id,
          sent_by: 'system',
          status: 'sent',
          whatsapp_message_id: result.messageId,
        });
      }

      return {
        success: result.success,
        messageId: result.messageId,
        departmentId: connection.department_id,
        error: result.error,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
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
