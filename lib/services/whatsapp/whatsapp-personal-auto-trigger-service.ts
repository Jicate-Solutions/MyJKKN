// lib/services/whatsapp/whatsapp-personal-auto-trigger-service.ts
// Auto-trigger engine — evaluates rules on lead events and fires personal WA messages

import { createClient } from '@supabase/supabase-js';
import { WhatsAppPersonalTemplateService } from './whatsapp-personal-template-service';
import { WhatsAppPersonalConnectionService } from './whatsapp-personal-connection-service';
import { WhatsAppPersonalMessageService } from './whatsapp-personal-message-service';
import { personalSendMessageAPI } from '@/lib/whatsapp/personal-api-client';
import type {
  AutoTriggerRule,
  AutoTriggerEventType,
  AutoTriggerConditions,
  CreateAutoTriggerInput,
  UpdateAutoTriggerInput,
  TemplateVariableContext,
  WAChannelType,
} from '@/types/whatsapp-personal';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Format phone for personal WA JID format: 91XXXXXXXXXX@c.us */
function formatPhoneForPersonalWA(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '');
  if (clean.startsWith('+91')) clean = clean.slice(1);
  else if (clean.startsWith('0')) clean = '91' + clean.slice(1);
  else if (/^[6-9]\d{9}$/.test(clean)) clean = '91' + clean;
  return clean + '@c.us';
}

export class WhatsAppPersonalAutoTriggerService {
  // =========================================================================
  // CRUD for trigger rules
  // =========================================================================

  static async getRules(institutionId: string): Promise<AutoTriggerRule[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_auto_trigger_rules')
      .select('*, template:wa_personal_message_templates(*)')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[wa-auto-trigger] getRules error:', error.message);
      return [];
    }
    return (data || []) as AutoTriggerRule[];
  }

  static async getRule(id: string): Promise<AutoTriggerRule | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_auto_trigger_rules')
      .select('*, template:wa_personal_message_templates(*)')
      .eq('id', id)
      .single();

    if (error) return null;
    return data as AutoTriggerRule;
  }

  static async createRule(
    input: CreateAutoTriggerInput,
    userId: string
  ): Promise<AutoTriggerRule | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_auto_trigger_rules')
      .insert({
        ...input,
        conditions: input.conditions || {},
        channel_priority: input.channel_priority || ['personal', 'meta_waba'],
        created_by: userId,
      })
      .select('*, template:wa_personal_message_templates(*)')
      .single();

    if (error) {
      console.error('[wa-auto-trigger] createRule error:', error.message);
      return null;
    }
    return data as AutoTriggerRule;
  }

  static async updateRule(
    id: string,
    input: UpdateAutoTriggerInput
  ): Promise<AutoTriggerRule | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_auto_trigger_rules')
      .update(input)
      .eq('id', id)
      .select('*, template:wa_personal_message_templates(*)')
      .single();

    if (error) {
      console.error('[wa-auto-trigger] updateRule error:', error.message);
      return null;
    }
    return data as AutoTriggerRule;
  }

  static async deleteRule(id: string): Promise<boolean> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('wa_auto_trigger_rules')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[wa-auto-trigger] deleteRule error:', error.message);
      return false;
    }
    return true;
  }

  // =========================================================================
  // Trigger evaluation + firing
  // =========================================================================

  /**
   * Evaluate and fire auto-trigger rules for a lead event.
   * Called from lead creation, stage change, or expo capture flows.
   */
  static async evaluateAndFire(params: {
    eventType: AutoTriggerEventType;
    institutionId: string;
    leadId: string;
    leadPhone: string;
    variableContext: TemplateVariableContext;
    source?: string;
    funnelStage?: string;
    expoEventId?: string;
  }): Promise<{ triggered: number; queued: number; skipped: number }> {
    const supabase = getServiceClient();
    let triggered = 0, queued = 0, skipped = 0;

    // 1. Find matching active rules
    const { data: rules } = await supabase
      .from('wa_auto_trigger_rules')
      .select('*, template:wa_personal_message_templates(*)')
      .eq('institution_id', params.institutionId)
      .eq('event_type', params.eventType)
      .eq('is_active', true);

    if (!rules || rules.length === 0) return { triggered: 0, queued: 0, skipped: 0 };

    // 2. Check consent
    const { data: lead } = await supabase
      .from('admission_leads')
      .select('wa_opt_in, counselor_id')
      .eq('id', params.leadId)
      .single();

    if (!lead?.wa_opt_in) {
      return { triggered: 0, queued: 0, skipped: rules.length };
    }

    // 3. Evaluate each rule
    for (const rule of rules as AutoTriggerRule[]) {
      // Check conditions match
      if (!this.matchesConditions(rule.conditions, params)) {
        skipped++;
        continue;
      }

      // Check daily limit
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('wa_personal_message_queue')
        .select('id', { count: 'exact', head: true })
        .eq('trigger_rule_id', rule.id)
        .eq('status', 'sent')
        .gte('created_at', `${today}T00:00:00.000Z`);

      if ((count ?? 0) >= rule.daily_limit) {
        skipped++;
        continue;
      }

      // Get template content
      const template = rule.template;
      if (!template) {
        skipped++;
        continue;
      }

      // Substitute variables
      const messageContent = WhatsAppPersonalTemplateService.substituteVariables(
        template.content,
        params.variableContext
      );

      // Try sending via channel priority
      const sent = await this.trySendViaChannels(
        rule.channel_priority,
        {
          institutionId: params.institutionId,
          leadId: params.leadId,
          phone: params.leadPhone,
          messageContent,
          triggerRuleId: rule.id,
          delaySeconds: rule.delay_seconds,
        }
      );

      if (sent === 'sent') triggered++;
      else if (sent === 'queued') queued++;
      else skipped++;
    }

    return { triggered, queued, skipped };
  }

  /** Check if rule conditions match the event parameters */
  private static matchesConditions(
    conditions: AutoTriggerConditions,
    params: { source?: string; funnelStage?: string; expoEventId?: string }
  ): boolean {
    if (conditions.source?.length && params.source) {
      if (!conditions.source.includes(params.source)) return false;
    }
    if (conditions.funnel_stage?.length && params.funnelStage) {
      if (!conditions.funnel_stage.includes(params.funnelStage)) return false;
    }
    if (conditions.expo_event_id && params.expoEventId) {
      if (conditions.expo_event_id !== params.expoEventId) return false;
    }
    return true;
  }

  /** Try sending through channels in priority order */
  private static async trySendViaChannels(
    channels: WAChannelType[],
    params: {
      institutionId: string;
      leadId: string;
      phone: string;
      messageContent: string;
      triggerRuleId: string;
      delaySeconds: number;
    }
  ): Promise<'sent' | 'queued' | 'failed'> {
    const supabase = getServiceClient();

    // If delayed, always queue
    if (params.delaySeconds > 0) {
      const nextRetry = new Date();
      nextRetry.setSeconds(nextRetry.getSeconds() + params.delaySeconds);

      await supabase.from('wa_personal_message_queue').insert({
        institution_id: params.institutionId,
        lead_id: params.leadId,
        phone: params.phone,
        message_content: params.messageContent,
        trigger_rule_id: params.triggerRuleId,
        channel: channels[0] || 'personal',
        status: 'queued',
        next_retry_at: nextRetry.toISOString(),
      });
      return 'queued';
    }

    // Try personal WA first if in priority list
    if (channels.includes('personal')) {
      const connection = await WhatsAppPersonalConnectionService.getAnyReadyConnection();
      if (connection && connection.status === 'ready') {
        try {
          const jid = formatPhoneForPersonalWA(params.phone);
          const clientId = connection.client_id || `dept-${connection.department_id}`;
          const serviceUrl = connection.service_url || process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';

          const result = await personalSendMessageAPI(jid, params.messageContent, {
            serviceUrl: `${serviceUrl}/clients/${clientId}`,
            apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
          });

          if (result.success) {
            // Log to personal message logs
            await WhatsAppPersonalMessageService.logMessage({
              department_id: connection.department_id,
              connection_id: connection.id,
              recipient_type: 'individual',
              recipient_phone: jid,
              message_content: params.messageContent,
              lead_id: params.leadId,
              sent_by: 'system', // Auto-triggered
              status: 'sent',
              whatsapp_message_id: result.messageId,
            });

            // Also log in queue for tracking
            await supabase.from('wa_personal_message_queue').insert({
              institution_id: params.institutionId,
              department_id: connection.department_id,
              lead_id: params.leadId,
              phone: params.phone,
              message_content: params.messageContent,
              trigger_rule_id: params.triggerRuleId,
              channel: 'personal',
              status: 'sent',
              wa_message_id: result.messageId,
              sent_at: new Date().toISOString(),
            });

            return 'sent';
          }
        } catch (err) {
          console.error('[wa-auto-trigger] Personal WA send failed:', err);
          // Fall through to queue
        }
      }
    }

    // Queue for later processing (personal WA not connected or failed)
    const fallbackChannel = channels.find(c => c !== 'personal') || channels[0] || 'personal';
    await supabase.from('wa_personal_message_queue').insert({
      institution_id: params.institutionId,
      lead_id: params.leadId,
      phone: params.phone,
      message_content: params.messageContent,
      trigger_rule_id: params.triggerRuleId,
      channel: fallbackChannel,
      status: 'queued',
      next_retry_at: new Date(Date.now() + 60_000).toISOString(), // retry in 1 min
    });

    return 'queued';
  }
}
