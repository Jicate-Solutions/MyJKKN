// lib/services/admission/sms-campaign-service.ts
// SMS Campaign Service for Admission CRM - MSG91/Twilio Integration

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  CommunicationTemplatesService,
  type CommunicationTemplate,
} from './communication-templates-service';

// ============================================================================
// TYPES
// ============================================================================

export type SMSProvider = 'msg91' | 'twilio';

export type SMSDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'
  | 'rejected';

export interface SMSLog {
  id: string;
  institution_id: string;
  lead_id: string;
  template_id: string | null;
  phone_number: string;
  message_content: string;
  provider: SMSProvider;
  provider_message_id: string | null;
  status: SMSDeliveryStatus;
  error_message: string | null;
  dlt_template_id: string | null;
  dlt_entity_id: string | null;
  cost: number | null;
  segments: number;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  // Virtual fields from joins
  lead_name?: string;
  template_name?: string;
}

export type SMSLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml' | 'mr' | 'gu' | 'bn' | 'pa';

export interface SendSMSInput {
  institutionId: string;
  leadId: string;
  phoneNumber: string;
  templateId?: string;
  messageContent?: string;
  variables?: Record<string, string>;
  dltTemplateId?: string;
  scheduledAt?: string;
  language?: SMSLanguage;
}

export interface BulkSMSInput {
  institutionId: string;
  templateId: string;
  leads: Array<{
    leadId: string;
    phoneNumber: string;
    variables: Record<string, string>;
  }>;
  dltTemplateId?: string;
}

export interface SMSSendResult {
  success: boolean;
  logId?: string;
  providerMessageId?: string;
  error?: string;
}

export interface SMSBulkResult {
  totalSent: number;
  totalFailed: number;
  results: Array<{
    leadId: string;
    success: boolean;
    logId?: string;
    error?: string;
  }>;
}

export interface SMSWebhookPayload {
  // MSG91 webhook format
  data?: {
    requestId?: string;
    userId?: string;
    report?: Array<{
      number: string;
      senderId: string;
      status: string;
      desc?: string;
      deliveryTime?: string;
    }>;
  };
  // Twilio webhook format
  MessageSid?: string;
  MessageStatus?: string;
  To?: string;
  From?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface SMSCampaignStats {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalPending: number;
  deliveryRate: number;
  costTotal: number;
  byDate: Array<{
    date: string;
    sent: number;
    delivered: number;
    failed: number;
  }>;
}

export interface SMSLogFilters {
  institutionId: string;
  leadId?: string;
  templateId?: string;
  status?: SMSDeliveryStatus;
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SMS CAMPAIGN SERVICE
// ============================================================================

export class SMSCampaignService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Get SMS provider configuration from environment
   */
  private static getProviderConfig(): {
    provider: SMSProvider;
    apiKey: string;
    senderId: string;
    dltEntityId?: string;
  } {
    const provider = (process.env.NEXT_PUBLIC_SMS_PROVIDER || 'msg91') as SMSProvider;

    if (provider === 'msg91') {
      return {
        provider: 'msg91',
        apiKey: process.env.MSG91_AUTH_KEY || '',
        senderId: process.env.MSG91_SENDER_ID || 'JKKNAD',
        dltEntityId: process.env.MSG91_DLT_ENTITY_ID,
      };
    }

    return {
      provider: 'twilio',
      apiKey: process.env.TWILIO_AUTH_TOKEN || '',
      senderId: process.env.TWILIO_PHONE_NUMBER || '',
    };
  }

  // ============================================================================
  // TEMPLATE VARIABLE REPLACEMENT
  // ============================================================================

  /**
   * Replace template variables with lead data
   */
  static replaceTemplateVariables(
    content: string,
    variables: Record<string, string>
  ): string {
    return CommunicationTemplatesService.replaceVariables(content, variables);
  }

  /**
   * Build variable map from lead data
   */
  static buildLeadVariables(lead: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    program_of_interest?: string;
    counselor_name?: string;
    institution_name?: string;
    application_id?: string;
    funnel_stage?: string;
  }): Record<string, string> {
    return {
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      full_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      email: lead.email || '',
      phone: lead.phone || '',
      program: lead.program_of_interest || '',
      counselor_name: lead.counselor_name || 'Admissions Team',
      institution_name: lead.institution_name || 'JKKN',
      application_id: lead.application_id || '',
      application_status: lead.funnel_stage || '',
    };
  }

  // ============================================================================
  // SEND SMS
  // ============================================================================

  /**
   * Send SMS to a single lead
   */
  static async sendCampaignSMS(input: SendSMSInput): Promise<SMSSendResult> {
    const config = this.getProviderConfig();

    try {
      // Validate phone number
      const phone = this.normalizePhoneNumber(input.phoneNumber);
      if (!phone) {
        return { success: false, error: 'Invalid phone number' };
      }

      // Get message content
      let messageContent = input.messageContent || '';

      if (input.templateId) {
        const template = await CommunicationTemplatesService.getTemplate(input.templateId);
        if (!template) {
          return { success: false, error: 'Template not found' };
        }
        if (template.channel !== 'sms') {
          return { success: false, error: 'Template is not an SMS template' };
        }
        messageContent = this.replaceTemplateVariables(template.content, input.variables || {});
      }

      if (!messageContent) {
        return { success: false, error: 'Message content is required' };
      }

      // Calculate segments
      const segments = Math.ceil(messageContent.length / 160);

      // Create log entry first (pending status)
      const logEntry = await this.createSMSLog({
        institution_id: input.institutionId,
        lead_id: input.leadId,
        template_id: input.templateId || null,
        phone_number: phone,
        message_content: messageContent,
        provider: config.provider,
        status: 'pending',
        dlt_template_id: input.dltTemplateId || null,
        dlt_entity_id: config.dltEntityId || null,
        segments,
      });

      // Send via provider
      let sendResult: { success: boolean; messageId?: string; error?: string };

      if (config.provider === 'msg91') {
        sendResult = await this.sendViaMSG91({
          phone,
          message: messageContent,
          senderId: config.senderId,
          dltTemplateId: input.dltTemplateId,
          dltEntityId: config.dltEntityId,
          authKey: config.apiKey,
        });
      } else {
        sendResult = await this.sendViaTwilio({
          phone,
          message: messageContent,
          fromNumber: config.senderId,
          authToken: config.apiKey,
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        });
      }

      // Update log with result
      await this.updateSMSLog(logEntry.id, {
        status: sendResult.success ? 'sent' : 'failed',
        provider_message_id: sendResult.messageId || null,
        error_message: sendResult.error || null,
        sent_at: sendResult.success ? new Date().toISOString() : null,
      });

      return {
        success: sendResult.success,
        logId: logEntry.id,
        providerMessageId: sendResult.messageId,
        error: sendResult.error,
      };
    } catch (error) {
      logger.error('admission/sms-campaign', 'Failed to send SMS', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      };
    }
  }

  /**
   * Send bulk SMS to multiple leads
   */
  static async sendBulkSMS(input: BulkSMSInput): Promise<SMSBulkResult> {
    const results: SMSBulkResult['results'] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Get template
    const template = await CommunicationTemplatesService.getTemplate(input.templateId);
    if (!template || template.channel !== 'sms') {
      return {
        totalSent: 0,
        totalFailed: input.leads.length,
        results: input.leads.map((lead) => ({
          leadId: lead.leadId,
          success: false,
          error: 'Invalid template',
        })),
      };
    }

    // Process leads in batches of 10 to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < input.leads.length; i += batchSize) {
      const batch = input.leads.slice(i, i + batchSize);

      const batchPromises = batch.map(async (lead) => {
        const result = await this.sendCampaignSMS({
          institutionId: input.institutionId,
          leadId: lead.leadId,
          phoneNumber: lead.phoneNumber,
          templateId: input.templateId,
          variables: lead.variables,
          dltTemplateId: input.dltTemplateId,
        });

        if (result.success) {
          totalSent++;
        } else {
          totalFailed++;
        }

        return {
          leadId: lead.leadId,
          success: result.success,
          logId: result.logId,
          error: result.error,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < input.leads.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info('admission/sms-campaign', 'Bulk SMS completed', {
      totalSent,
      totalFailed,
      totalLeads: input.leads.length,
    });

    return { totalSent, totalFailed, results };
  }

  // ============================================================================
  // PROVIDER INTEGRATIONS
  // ============================================================================

  /**
   * Send SMS via MSG91
   */
  private static async sendViaMSG91(params: {
    phone: string;
    message: string;
    senderId: string;
    dltTemplateId?: string;
    dltEntityId?: string;
    authKey: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const payload = {
        sender: params.senderId,
        route: '4', // Transactional route
        country: '91', // India
        sms: [
          {
            message: params.message,
            to: [params.phone.replace(/^\+91/, '')],
          },
        ],
        DLT_TE_ID: params.dltTemplateId,
        ...(params.dltEntityId && { DLT_PE_ID: params.dltEntityId }),
      };

      const response = await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: params.authKey,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.type === 'success' || result.message === 'success') {
        return {
          success: true,
          messageId: result.request_id || result.message_id,
        };
      }

      return {
        success: false,
        error: result.message || 'MSG91 sending failed',
      };
    } catch (error) {
      logger.error('admission/sms-campaign', 'MSG91 API error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MSG91 API error',
      };
    }
  }

  /**
   * Send SMS via Twilio
   */
  private static async sendViaTwilio(params: {
    phone: string;
    message: string;
    fromNumber: string;
    authToken: string;
    accountSid: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const basicAuth = Buffer.from(`${params.accountSid}:${params.authToken}`).toString('base64');

      const formData = new URLSearchParams();
      formData.append('To', params.phone);
      formData.append('From', params.fromNumber);
      formData.append('Body', params.message);

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
          body: formData.toString(),
        }
      );

      const result = await response.json();

      if (result.sid) {
        return {
          success: true,
          messageId: result.sid,
        };
      }

      return {
        success: false,
        error: result.message || 'Twilio sending failed',
      };
    } catch (error) {
      logger.error('admission/sms-campaign', 'Twilio API error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Twilio API error',
      };
    }
  }

  // ============================================================================
  // WEBHOOK HANDLING
  // ============================================================================

  /**
   * Handle SMS delivery webhook from provider
   */
  static async handleWebhook(
    provider: SMSProvider,
    payload: SMSWebhookPayload
  ): Promise<{ success: boolean; updated: number; error?: string }> {
    try {
      let updated = 0;

      if (provider === 'msg91' && payload.data?.report) {
        // MSG91 webhook format
        for (const report of payload.data.report) {
          const status = this.mapMSG91Status(report.status);

          const { error } = await this.supabase
            .from('admission_sms_logs')
            .update({
              status,
              delivered_at: status === 'delivered' ? report.deliveryTime || new Date().toISOString() : null,
              error_message: report.desc || null,
              updated_at: new Date().toISOString(),
            })
            .eq('provider_message_id', payload.data.requestId)
            .eq('phone_number', report.number);

          if (!error) updated++;
        }
      } else if (provider === 'twilio' && payload.MessageSid) {
        // Twilio webhook format
        const status = this.mapTwilioStatus(payload.MessageStatus || '');

        const { error } = await this.supabase
          .from('admission_sms_logs')
          .update({
            status,
            delivered_at: status === 'delivered' ? new Date().toISOString() : null,
            error_message: payload.ErrorMessage || null,
            updated_at: new Date().toISOString(),
          })
          .eq('provider_message_id', payload.MessageSid);

        if (!error) updated = 1;
      }

      logger.info('admission/sms-campaign', 'Webhook processed', { provider, updated });

      return { success: true, updated };
    } catch (error) {
      logger.error('admission/sms-campaign', 'Webhook processing failed', error);
      return {
        success: false,
        updated: 0,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      };
    }
  }

  /**
   * Map MSG91 status to internal status
   */
  private static mapMSG91Status(msg91Status: string): SMSDeliveryStatus {
    const statusMap: Record<string, SMSDeliveryStatus> = {
      '1': 'delivered',
      '2': 'failed',
      '8': 'sent',
      '9': 'queued',
      '17': 'rejected',
      '25': 'pending',
      DELIVRD: 'delivered',
      UNDELIV: 'undelivered',
      EXPIRED: 'failed',
      REJECTED: 'rejected',
      SENT: 'sent',
    };
    return statusMap[msg91Status] || 'pending';
  }

  /**
   * Map Twilio status to internal status
   */
  private static mapTwilioStatus(twilioStatus: string): SMSDeliveryStatus {
    const statusMap: Record<string, SMSDeliveryStatus> = {
      queued: 'queued',
      sending: 'pending',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'undelivered',
      failed: 'failed',
      canceled: 'rejected',
    };
    return statusMap[twilioStatus.toLowerCase()] || 'pending';
  }

  // ============================================================================
  // DELIVERY STATUS
  // ============================================================================

  /**
   * Get delivery status for a specific SMS log
   */
  static async getDeliveryStatus(logId: string): Promise<SMSLog | null> {
    const { data, error } = await this.supabase
      .from('admission_sms_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (error) {
      logger.warn('admission/sms-campaign', 'Failed to get delivery status', error);
      return null;
    }

    return data as SMSLog;
  }

  /**
   * Get SMS logs with filters
   */
  static async getSMSLogs(filters: SMSLogFilters): Promise<{ logs: SMSLog[]; total: number }> {
    let query = this.supabase
      .from('admission_sms_logs')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.leadId) {
      query = query.eq('lead_id', filters.leadId);
    }

    if (filters.templateId) {
      query = query.eq('template_id', filters.templateId);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.lte('created_at', filters.toDate);
    }

    if (filters.search) {
      query = query.or(`phone_number.ilike.%${filters.search}%,message_content.ilike.%${filters.search}%`);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('admission/sms-campaign', 'Failed to fetch SMS logs', error);
      throw new Error('Failed to fetch SMS logs');
    }

    return {
      logs: (data || []) as SMSLog[],
      total: count || 0,
    };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get SMS campaign statistics
   */
  static async getCampaignStats(
    institutionId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<SMSCampaignStats> {
    let query = this.supabase
      .from('admission_sms_logs')
      .select('status, cost, created_at')
      .eq('institution_id', institutionId);

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    if (toDate) {
      query = query.lte('created_at', toDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.warn('admission/sms-campaign', 'Failed to fetch stats', error);
    }

    const logs = data || [];

    const totalSent = logs.filter((l) => ['sent', 'delivered'].includes(l.status)).length;
    const totalDelivered = logs.filter((l) => l.status === 'delivered').length;
    const totalFailed = logs.filter((l) => ['failed', 'undelivered', 'rejected'].includes(l.status)).length;
    const totalPending = logs.filter((l) => ['pending', 'queued'].includes(l.status)).length;
    const costTotal = logs.reduce((sum, l) => sum + (l.cost || 0), 0);

    // Group by date
    const byDateMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    for (const log of logs) {
      const date = log.created_at.split('T')[0];
      const entry = byDateMap.get(date) || { sent: 0, delivered: 0, failed: 0 };

      if (['sent', 'delivered'].includes(log.status)) entry.sent++;
      if (log.status === 'delivered') entry.delivered++;
      if (['failed', 'undelivered', 'rejected'].includes(log.status)) entry.failed++;

      byDateMap.set(date, entry);
    }

    const byDate = Array.from(byDateMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      totalPending,
      deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      costTotal,
      byDate,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Normalize phone number to E.164 format
   */
  private static normalizePhoneNumber(phone: string): string | null {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Handle Indian phone numbers
    if (digits.length === 10) {
      return `+91${digits}`;
    }

    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }

    if (digits.length === 13 && digits.startsWith('91')) {
      return `+${digits.slice(0, 12)}`;
    }

    // For other formats, try to return as-is with + prefix
    if (digits.length >= 10 && digits.length <= 15) {
      return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
    }

    return null;
  }

  /**
   * Create SMS log entry
   */
  private static async createSMSLog(data: {
    institution_id: string;
    lead_id: string;
    template_id: string | null;
    phone_number: string;
    message_content: string;
    provider: SMSProvider;
    status: SMSDeliveryStatus;
    dlt_template_id: string | null;
    dlt_entity_id: string | null;
    segments: number;
  }): Promise<SMSLog> {
    const { data: log, error } = await this.supabase
      .from('admission_sms_logs')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('admission/sms-campaign', 'Failed to create SMS log', error);
      throw new Error('Failed to create SMS log');
    }

    return log as SMSLog;
  }

  /**
   * Update SMS log entry
   */
  private static async updateSMSLog(id: string, data: Partial<SMSLog>): Promise<void> {
    const { error } = await this.supabase
      .from('admission_sms_logs')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      logger.error('admission/sms-campaign', 'Failed to update SMS log', error);
    }
  }

  // ============================================================================
  // MULTILINGUAL SMS (4.4)
  // ============================================================================

  /**
   * Supported languages for multilingual SMS
   */
  static getSupportedLanguages(): Array<{ code: SMSLanguage; label: string; nativeLabel: string }> {
    return [
      { code: 'en', label: 'English', nativeLabel: 'English' },
      { code: 'hi', label: 'Hindi', nativeLabel: '\u0939\u093f\u0902\u0926\u0940' },
      { code: 'ta', label: 'Tamil', nativeLabel: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd' },
      { code: 'te', label: 'Telugu', nativeLabel: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41' },
      { code: 'kn', label: 'Kannada', nativeLabel: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1' },
      { code: 'ml', label: 'Malayalam', nativeLabel: '\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02' },
      { code: 'mr', label: 'Marathi', nativeLabel: '\u092e\u0930\u093e\u0920\u0940' },
      { code: 'gu', label: 'Gujarati', nativeLabel: '\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0' },
      { code: 'bn', label: 'Bengali', nativeLabel: '\u09ac\u09be\u0982\u09b2\u09be' },
      { code: 'pa', label: 'Punjabi', nativeLabel: '\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40' },
    ];
  }

  /**
   * Send SMS in lead's preferred language.
   * If a language-specific template variant exists (e.g., template_name_ta),
   * it will be used. Otherwise falls back to the base template in the requested language.
   */
  static async sendMultilingualSMS(input: SendSMSInput): Promise<SMSSendResult> {
    const language = input.language || 'en';

    // If a template is specified, look for a language-specific variant
    if (input.templateId && language !== 'en') {
      const supabase = createClientSupabaseClient();

      // Try to find a language variant of the template
      const { data: baseTemplate } = await (supabase as any)
        .from('admission_communication_templates')
        .select('name, institution_id')
        .eq('id', input.templateId)
        .single();

      if (baseTemplate) {
        const variantName = `${baseTemplate.name}_${language}`;
        const { data: variant } = await (supabase as any)
          .from('admission_communication_templates')
          .select('id')
          .eq('name', variantName)
          .eq('institution_id', baseTemplate.institution_id)
          .eq('channel', 'sms')
          .eq('is_active', true)
          .single();

        if (variant) {
          // Use the language-specific template variant
          return this.sendCampaignSMS({ ...input, templateId: variant.id });
        }
      }
    }

    // Fall back to sending the base template with language metadata
    return this.sendCampaignSMS(input);
  }

  /**
   * Detect lead's preferred language from their metadata or communication history.
   * Returns 'en' if no preference is found.
   */
  static async detectLeadLanguage(leadId: string): Promise<SMSLanguage> {
    const supabase = createClientSupabaseClient();

    const { data: lead } = await (supabase as any)
      .from('admission_leads')
      .select('metadata')
      .eq('id', leadId)
      .single();

    if (lead?.metadata?.preferred_language) {
      return lead.metadata.preferred_language as SMSLanguage;
    }

    // Default to English
    return 'en';
  }

  /**
   * Send bulk SMS with automatic language detection per lead.
   * Each lead receives the message in their preferred language if a template variant exists.
   */
  static async sendMultilingualBulkSMS(input: BulkSMSInput): Promise<SMSBulkResult> {
    const results: SMSBulkResult['results'] = [];
    let totalSent = 0;
    let totalFailed = 0;

    const batchSize = 10;
    for (let i = 0; i < input.leads.length; i += batchSize) {
      const batch = input.leads.slice(i, i + batchSize);

      const batchPromises = batch.map(async (lead) => {
        const language = await this.detectLeadLanguage(lead.leadId);

        const result = await this.sendMultilingualSMS({
          institutionId: input.institutionId,
          leadId: lead.leadId,
          phoneNumber: lead.phoneNumber,
          templateId: input.templateId,
          variables: lead.variables,
          dltTemplateId: input.dltTemplateId,
          language,
        });

        if (result.success) {
          totalSent++;
        } else {
          totalFailed++;
        }

        return {
          leadId: lead.leadId,
          success: result.success,
          logId: result.logId,
          error: result.error,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < input.leads.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info('admission/sms-campaign', 'Multilingual bulk SMS completed', {
      totalSent,
      totalFailed,
      totalLeads: input.leads.length,
    });

    return { totalSent, totalFailed, results };
  }

  /**
   * Validate DLT template (Indian SMS regulations)
   */
  static validateDLTTemplate(
    content: string,
    dltTemplateId?: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // DLT template ID is required for promotional/transactional SMS in India
    if (!dltTemplateId) {
      errors.push('DLT Template ID is required for SMS in India');
    }

    // Content should not exceed 2000 characters (multi-part SMS limit)
    if (content.length > 2000) {
      errors.push('Message content exceeds maximum length of 2000 characters');
    }

    // Check for proper variable format
    const variableRegex = /\{#var#\}/g;
    const doubleVariableRegex = /\{\{(\w+)\}\}/g;

    // DLT templates use {#var#} format, but our system uses {{variable}}
    // Content should be validated after variable replacement
    const hasOurVariables = doubleVariableRegex.test(content);
    if (hasOurVariables) {
      errors.push('Template contains unreplaced variables. Ensure all {{variable}} placeholders are replaced.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
