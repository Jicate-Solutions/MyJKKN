// lib/services/admission/expo-whatsapp-service.ts
// Expo WhatsApp Integration — sends welcome messages to leads captured at expos
// Uses Meta Cloud API via whatsapp-api-client, respects DPDPA consent

import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendTemplateMessage,
  isWhatsAppConfigured,
  type WATemplateComponent,
} from '@/lib/services/whatsapp/whatsapp-api-client';

// =============================================================================
// Types
// =============================================================================

export interface ExpoWelcomeInput {
  leadId: string;
  leadPhone: string;
  leadName: string;
  parentPhone?: string | null;
  parentName?: string | null;
  eventName: string;
  institutionId: string;
  institutionName?: string;
  expoEventId: string;
  interestedPrograms?: string;
}

export interface SendResult {
  success: boolean;
  waMessageId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// =============================================================================
// Constants
// =============================================================================

const TEMPLATE_NAME = 'exhibition_thankyou';
const TEMPLATE_LANGUAGE = 'en';
const DAILY_LIMIT = 950; // Stay under TIER_1K (1000) with safety margin

// =============================================================================
// Service
// =============================================================================

export class ExpoWhatsAppService {
  /**
   * Send expo welcome message to a newly captured lead.
   * Checks: WA configured, consent given, daily limit not exceeded.
   * Non-blocking — caller should wrap in try/catch.
   */
  static async sendExpoWelcome(input: ExpoWelcomeInput): Promise<SendResult> {
    // 1. Check if WhatsApp Cloud API is configured
    if (!isWhatsAppConfigured()) {
      return { success: false, skipped: true, skipReason: 'whatsapp_not_configured' };
    }

    const supabase = createServiceRoleClient();

    // 2. Check consent — respect DPDPA opt-out
    const { data: lead } = await (supabase as any)
      .from('admission_leads')
      .select('wa_opt_in')
      .eq('id', input.leadId)
      .single();

    if (!lead?.wa_opt_in) {
      return { success: false, skipped: true, skipReason: 'no_consent' };
    }

    // 3. Check daily send limit (TIER_1K safety)
    const today = new Date().toISOString().split('T')[0];
    const { count } = await (supabase as any)
      .from('expo_wa_message_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', `${today}T00:00:00.000Z`);

    if ((count ?? 0) >= DAILY_LIMIT) {
      // Queue for next day instead of sending now
      await this.queueMessage(supabase, input, 'daily_limit_reached');
      return { success: false, skipped: true, skipReason: 'daily_limit_reached' };
    }

    // 4. Format phone for WhatsApp (add country code if missing)
    const phone = formatPhoneForWA(input.leadPhone);

    // 5. Build template parameters
    const components = buildTemplateComponents(input);

    // 6. Send via Cloud API
    try {
      const waResponse = await sendTemplateMessage(
        phone,
        TEMPLATE_NAME,
        TEMPLATE_LANGUAGE,
        components
      );

      const waMessageId = waResponse.messages?.[0]?.id;

      // 7. Log to message queue table
      await this.logMessage(supabase, {
        expoEventId: input.expoEventId,
        leadId: input.leadId,
        phone,
        templateName: TEMPLATE_NAME,
        status: 'sent',
        waMessageId: waMessageId || null,
      });

      // 8. Create/update wa_conversation for this lead
      await this.ensureConversation(supabase, input, waMessageId);

      return { success: true, waMessageId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[admission/expo-wa] Failed to send welcome:', {
        leadId: input.leadId,
        phone,
        error: errorMsg,
      });

      // Log failed attempt for retry
      await this.logMessage(supabase, {
        expoEventId: input.expoEventId,
        leadId: input.leadId,
        phone,
        templateName: TEMPLATE_NAME,
        status: 'failed',
        waMessageId: null,
        errorMessage: errorMsg,
      });

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send expo welcome via personal WhatsApp (BYOW).
   * Finds any ready personal connection and sends the templated message.
   * Falls back to queueing if no connection is ready.
   */
  static async sendExpoWelcomeViaPersonal(input: ExpoWelcomeInput & {
    templateContent?: string;
  }): Promise<SendResult> {
    const supabase = createServiceRoleClient();

    // 1. Check consent
    const { data: lead } = await (supabase as any)
      .from('admission_leads')
      .select('wa_opt_in')
      .eq('id', input.leadId)
      .single();

    if (!lead?.wa_opt_in) {
      return { success: false, skipped: true, skipReason: 'no_consent' };
    }

    // 2. Build message content from template or default
    let messageContent = input.templateContent;
    if (!messageContent) {
      // Try to get default expo_welcome template for institution
      const { WhatsAppPersonalTemplateService } = await import(
        '@/lib/services/whatsapp/whatsapp-personal-template-service'
      );
      const template = await WhatsAppPersonalTemplateService.getDefaultTemplate(
        input.institutionId,
        'expo_welcome'
      );
      if (template) {
        messageContent = WhatsAppPersonalTemplateService.substituteVariables(template.content, {
          lead_name: input.leadName,
          parent_name: input.parentName || undefined,
          event_name: input.eventName,
          institution_name: input.institutionName || 'JKKN Institutions',
        });
      } else {
        // Fallback default message
        messageContent = `Hello ${input.leadName}! Thank you for visiting us at ${input.eventName}. We are excited about your interest in ${input.institutionName || 'JKKN Institutions'}. Our counselor will reach out to you shortly. Reply STOP to opt out.`;
      }
    }

    // 3. Find ready personal connection
    const { WhatsAppPersonalConnectionService } = await import(
      '@/lib/services/whatsapp/whatsapp-personal-connection-service'
    );
    const connection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();

    if (!connection || connection.status !== 'ready') {
      // Queue for later
      await supabase.from('wa_personal_message_queue').insert({
        institution_id: input.institutionId,
        lead_id: input.leadId,
        phone: formatPhoneForWA(input.leadPhone),
        message_content: messageContent,
        channel: 'personal',
        status: 'queued',
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      });
      return { success: false, skipped: true, skipReason: 'personal_wa_not_connected_queued' };
    }

    // 4. Send via Railway service
    try {
      const { personalSendMessageAPI } = await import('@/lib/whatsapp/personal-api-client');
      const jid = formatPhoneForWA(input.leadPhone).replace(/^\+?/, '') + '@c.us';
      // Convert to JID format for personal WA
      let cleanPhone = input.leadPhone.replace(/[\s\-()]/g, '');
      if (cleanPhone.startsWith('+91')) cleanPhone = cleanPhone.slice(1);
      else if (cleanPhone.startsWith('0')) cleanPhone = '91' + cleanPhone.slice(1);
      else if (/^[6-9]\d{9}$/.test(cleanPhone)) cleanPhone = '91' + cleanPhone;
      const personalJid = cleanPhone + '@c.us';

      const clientId = connection.client_id || `dept-${connection.department_id}`;
      const serviceUrl = connection.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

      const result = await personalSendMessageAPI(personalJid, messageContent, {
        serviceUrl: `${serviceUrl}/clients/${clientId}`,
        apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
      });

      if (result.success) {
        // Log to personal message logs
        const { WhatsAppPersonalMessageService } = await import(
          '@/lib/services/whatsapp/whatsapp-personal-message-service'
        );
        await WhatsAppPersonalMessageService.logMessage({
          department_id: connection.department_id,
          connection_id: connection.id,
          recipient_type: 'individual',
          recipient_phone: personalJid,
          message_content: messageContent,
          lead_id: input.leadId,
          sent_by: 'system',
          status: 'sent',
          whatsapp_message_id: result.messageId,
        });

        // Also log to queue table for tracking
        await supabase.from('wa_personal_message_queue').insert({
          institution_id: input.institutionId,
          department_id: connection.department_id,
          lead_id: input.leadId,
          phone: input.leadPhone,
          message_content: messageContent,
          channel: 'personal',
          status: 'sent',
          wa_message_id: result.messageId,
          sent_at: new Date().toISOString(),
        });

        return { success: true, waMessageId: result.messageId };
      } else {
        throw new Error(result.error || 'Personal WA send failed');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[admission/expo-wa] Personal WA send failed:', {
        leadId: input.leadId,
        error: errorMsg,
      });

      // Queue for retry
      await supabase.from('wa_personal_message_queue').insert({
        institution_id: input.institutionId,
        lead_id: input.leadId,
        phone: input.leadPhone,
        message_content: messageContent,
        channel: 'personal',
        status: 'failed',
        error_message: errorMsg,
        retry_count: 0,
        next_retry_at: new Date(Date.now() + 120_000).toISOString(),
      });

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Queue a message for later delivery (used when daily limit hit or for retry)
   */
  private static async queueMessage(
    supabase: any,
    input: ExpoWelcomeInput,
    reason: string
  ): Promise<void> {
    const nextRetry = new Date();
    nextRetry.setHours(nextRetry.getHours() + 1); // retry in 1 hour

    await supabase.from('expo_wa_message_queue').insert({
      expo_event_id: input.expoEventId,
      lead_id: input.leadId,
      phone: formatPhoneForWA(input.leadPhone),
      template_name: TEMPLATE_NAME,
      template_params: buildTemplateComponents(input),
      status: 'queued',
      retry_count: 0,
      next_retry_at: nextRetry.toISOString(),
      error_message: reason,
    });
  }

  /**
   * Log a sent/failed message to the queue table for tracking
   */
  private static async logMessage(
    supabase: any,
    data: {
      expoEventId: string;
      leadId: string;
      phone: string;
      templateName: string;
      status: 'sent' | 'failed' | 'queued';
      waMessageId: string | null;
      errorMessage?: string;
    }
  ): Promise<void> {
    await supabase.from('expo_wa_message_queue').insert({
      expo_event_id: data.expoEventId,
      lead_id: data.leadId,
      phone: data.phone,
      template_name: data.templateName,
      status: data.status,
      wa_message_id: data.waMessageId,
      error_message: data.errorMessage || null,
      retry_count: 0,
    });
  }

  /**
   * Ensure a wa_conversation exists for this lead (create if needed)
   * so counselors can see inbound replies in the chat inbox
   */
  private static async ensureConversation(
    supabase: any,
    input: ExpoWelcomeInput,
    waMessageId?: string | null
  ): Promise<void> {
    const phone = formatPhoneForWA(input.leadPhone);

    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('wa_conversations')
      .select('id')
      .eq('institution_id', input.institutionId)
      .eq('contact_phone', phone)
      .limit(1)
      .single();

    if (existing) {
      // Update existing conversation
      await supabase
        .from('wa_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: `[Template: ${TEMPLATE_NAME}]`,
          status: 'waiting',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      // Insert message record
      if (waMessageId) {
        await supabase.from('wa_messages').insert({
          conversation_id: existing.id,
          wa_message_id: waMessageId,
          direction: 'outbound',
          sender_type: 'system',
          message_type: 'template',
          content: { template_name: TEMPLATE_NAME, context: 'expo_welcome' },
          status: 'sent',
        });
      }
    } else {
      // Create new conversation
      const { data: conv } = await supabase
        .from('wa_conversations')
        .insert({
          institution_id: input.institutionId,
          lead_id: input.leadId,
          contact_phone: phone,
          contact_name: input.leadName,
          status: 'waiting',
          last_message_at: new Date().toISOString(),
          last_message_preview: `[Template: ${TEMPLATE_NAME}]`,
          tags: ['expo', 'auto-welcome'],
          metadata: { expo_event_id: input.expoEventId, event_name: input.eventName },
        })
        .select('id')
        .single();

      if (conv && waMessageId) {
        await supabase.from('wa_messages').insert({
          conversation_id: conv.id,
          wa_message_id: waMessageId,
          direction: 'outbound',
          sender_type: 'system',
          message_type: 'template',
          content: { template_name: TEMPLATE_NAME, context: 'expo_welcome' },
          status: 'sent',
        });
      }
    }
  }

  /**
   * Process queued/failed messages (called by cron or API route)
   * Retries failed messages with exponential backoff, max 3 attempts
   */
  static async processQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    if (!isWhatsAppConfigured()) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    // Fetch messages ready for retry
    const { data: pending } = await (supabase as any)
      .from('expo_wa_message_queue')
      .select('*, admission_leads!inner(wa_opt_in, first_name, last_name, phone)')
      .in('status', ['queued', 'failed'])
      .lt('retry_count', 3)
      .lte('next_retry_at', now)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!pending || pending.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const msg of pending) {
      // Respect opt-out
      if (!msg.admission_leads?.wa_opt_in) {
        await (supabase as any)
          .from('expo_wa_message_queue')
          .update({ status: 'skipped', error_message: 'consent_revoked' })
          .eq('id', msg.id);
        continue;
      }

      try {
        const waResponse = await sendTemplateMessage(
          msg.phone,
          msg.template_name,
          TEMPLATE_LANGUAGE,
          msg.template_params
        );

        const waMessageId = waResponse.messages?.[0]?.id;

        await (supabase as any)
          .from('expo_wa_message_queue')
          .update({
            status: 'sent',
            wa_message_id: waMessageId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', msg.id);

        sent++;
      } catch (err) {
        const retryCount = (msg.retry_count || 0) + 1;
        const backoffMinutes = Math.pow(2, retryCount) * 15; // 30min, 60min, 120min
        const nextRetry = new Date();
        nextRetry.setMinutes(nextRetry.getMinutes() + backoffMinutes);

        await (supabase as any)
          .from('expo_wa_message_queue')
          .update({
            status: retryCount >= 3 ? 'permanently_failed' : 'failed',
            retry_count: retryCount,
            next_retry_at: nextRetry.toISOString(),
            error_message: err instanceof Error ? err.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', msg.id);

        failed++;
      }
    }

    return { processed: pending.length, sent, failed };
  }

  /**
   * Get message stats for a specific expo event (used by capture stats bar)
   */
  static async getEventMessageStats(expoEventId: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    queued: number;
  }> {
    const supabase = createServiceRoleClient();

    const { data } = await (supabase as any)
      .from('expo_wa_message_queue')
      .select('status')
      .eq('expo_event_id', expoEventId);

    if (!data) return { total: 0, sent: 0, failed: 0, queued: 0 };

    return {
      total: data.length,
      sent: data.filter((m: any) => m.status === 'sent').length,
      failed: data.filter((m: any) => ['failed', 'permanently_failed'].includes(m.status)).length,
      queued: data.filter((m: any) => m.status === 'queued').length,
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Format phone number for WhatsApp Cloud API (requires country code, no +) */
function formatPhoneForWA(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '');
  // Add India country code if not present
  if (clean.startsWith('+91')) {
    clean = clean.slice(1); // remove + → "91XXXXXXXXXX"
  } else if (clean.startsWith('0')) {
    clean = '91' + clean.slice(1);
  } else if (/^[6-9]\d{9}$/.test(clean)) {
    clean = '91' + clean;
  }
  return clean;
}

/** Build template components with lead/event parameters */
function buildTemplateComponents(input: ExpoWelcomeInput): WATemplateComponent[] {
  // exhibition_thankyou template:
  // "Hi {{1}}, thank you for visiting JKKN at {{2}}! You showed interest in {{3}}."
  // body: {{1}} = student name, {{2}} = event name, {{3}} = interested program(s)
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: input.leadName },
        { type: 'text', text: input.eventName },
        { type: 'text', text: input.interestedPrograms || 'our programs' },
      ],
    },
  ];
}
