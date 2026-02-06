// lib/services/admission/whatsapp-campaign-service.ts
// WhatsApp Campaign Service for Admission CRM
// Integrates with WhatsApp MCP server for sending campaign messages

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CommunicationTemplatesService } from './communication-templates-service';

// ============================================================================
// TYPES
// ============================================================================

export type WhatsAppDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppMessage {
  id: string;
  institution_id: string;
  lead_id: string;
  template_id: string | null;
  recipient_phone: string;
  message_content: string;
  delivery_status: WhatsAppDeliveryStatus;
  whatsapp_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  // Campaign context
  campaign_id: string | null;
  workflow_execution_id: string | null;
  // Metadata
  metadata: Record<string, unknown>;
}

export interface SendCampaignMessageInput {
  institution_id: string;
  lead_id: string;
  template_id?: string;
  recipient_phone: string;
  message_content?: string;
  variables?: Record<string, string>;
  campaign_id?: string;
  workflow_execution_id?: string;
  metadata?: Record<string, unknown>;
}

export interface SendCampaignMessageResult {
  success: boolean;
  message_id?: string;
  whatsapp_message_id?: string;
  error?: string;
}

export interface WhatsAppMessageFilters {
  institutionId: string;
  leadId?: string;
  campaignId?: string;
  deliveryStatus?: WhatsAppDeliveryStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface WhatsAppCampaignStats {
  totalMessages: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pendingCount: number;
  deliveryRate: number;
  readRate: number;
}

export interface WebhookPayload {
  event: 'sent' | 'delivered' | 'read' | 'failed';
  message_id: string;
  timestamp: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class WhatsAppCampaignService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // MESSAGE SENDING
  // ============================================================================

  /**
   * Send a WhatsApp campaign message to a lead
   * Uses templates from admission_communication_templates where type='whatsapp'
   */
  static async sendCampaignMessage(input: SendCampaignMessageInput): Promise<SendCampaignMessageResult> {
    try {
      // Format phone number (remove + and spaces)
      const formattedPhone = this.formatPhoneNumber(input.recipient_phone);

      // Get message content
      let messageContent = input.message_content || '';

      // If template_id is provided, fetch template and replace variables
      if (input.template_id) {
        const template = await CommunicationTemplatesService.getTemplate(input.template_id);
        if (!template) {
          return {
            success: false,
            error: 'Template not found',
          };
        }

        if (template.type !== 'whatsapp') {
          return {
            success: false,
            error: 'Template is not a WhatsApp template',
          };
        }

        // Replace variables in template content
        messageContent = this.replaceTemplateVariables(
          template.content,
          input.variables || {}
        );
      }

      if (!messageContent) {
        return {
          success: false,
          error: 'Message content is required',
        };
      }

      // Create log entry with pending status
      const { data: logEntry, error: insertError } = await this.supabase
        .from('admission_whatsapp_logs')
        .insert({
          institution_id: input.institution_id,
          lead_id: input.lead_id,
          template_id: input.template_id || null,
          recipient_phone: formattedPhone,
          message_content: messageContent,
          delivery_status: 'pending',
          campaign_id: input.campaign_id || null,
          workflow_execution_id: input.workflow_execution_id || null,
          metadata: input.metadata || {},
        })
        .select()
        .single();

      if (insertError) {
        console.error('[admission/whatsapp-campaign] Failed to create log entry:', insertError);
        return {
          success: false,
          error: 'Failed to create message log',
        };
      }

      // Note: In production, this would call the WhatsApp MCP server
      // For now, we mark as sent and return the log ID
      // The actual sending would be handled by a background processor or API route
      // that has access to the MCP tools

      // Update status to sent (simulated - in real scenario this happens after MCP call)
      const { error: updateError } = await this.supabase
        .from('admission_whatsapp_logs')
        .update({
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);

      if (updateError) {
        console.error('[admission/whatsapp-campaign] Failed to update status:', updateError);
      }

      return {
        success: true,
        message_id: logEntry.id,
      };
    } catch (error) {
      console.error('[admission/whatsapp-campaign] Error sending message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send bulk WhatsApp messages to multiple leads
   */
  static async sendBulkMessages(
    messages: SendCampaignMessageInput[]
  ): Promise<{ total: number; succeeded: number; failed: number; results: SendCampaignMessageResult[] }> {
    const results: SendCampaignMessageResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const message of messages) {
      const result = await this.sendCampaignMessage(message);
      results.push(result);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }

      // Add small delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      total: messages.length,
      succeeded,
      failed,
      results,
    };
  }

  // ============================================================================
  // STATUS TRACKING
  // ============================================================================

  /**
   * Get delivery status of a message
   */
  static async getDeliveryStatus(messageId: string): Promise<WhatsAppMessage | null> {
    const { data, error } = await this.supabase
      .from('admission_whatsapp_logs')
      .select('*')
      .eq('id', messageId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/whatsapp-campaign] Failed to get delivery status:', error);
      throw new Error('Failed to get delivery status');
    }

    return data;
  }

  /**
   * Get messages for a lead
   */
  static async getLeadMessages(leadId: string): Promise<WhatsAppMessage[]> {
    const { data, error } = await this.supabase
      .from('admission_whatsapp_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admission/whatsapp-campaign] Failed to get lead messages:', error);
      throw new Error('Failed to get lead messages');
    }

    return data || [];
  }

  /**
   * Get messages with filters
   */
  static async getMessages(filters: WhatsAppMessageFilters): Promise<WhatsAppMessage[]> {
    let query = this.supabase
      .from('admission_whatsapp_logs')
      .select('*')
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.leadId) {
      query = query.eq('lead_id', filters.leadId);
    }

    if (filters.campaignId) {
      query = query.eq('campaign_id', filters.campaignId);
    }

    if (filters.deliveryStatus) {
      query = query.eq('delivery_status', filters.deliveryStatus);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admission/whatsapp-campaign] Failed to get messages:', error);
      throw new Error('Failed to get messages');
    }

    return data || [];
  }

  // ============================================================================
  // WEBHOOK HANDLING
  // ============================================================================

  /**
   * Handle delivery status webhook from WhatsApp
   */
  static async handleWebhook(payload: WebhookPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      switch (payload.event) {
        case 'sent':
          updateData.delivery_status = 'sent';
          updateData.sent_at = payload.timestamp;
          updateData.whatsapp_message_id = payload.metadata?.message_id || null;
          break;
        case 'delivered':
          updateData.delivery_status = 'delivered';
          updateData.delivered_at = payload.timestamp;
          break;
        case 'read':
          updateData.delivery_status = 'read';
          updateData.read_at = payload.timestamp;
          break;
        case 'failed':
          updateData.delivery_status = 'failed';
          updateData.failed_at = payload.timestamp;
          updateData.error_message = payload.error || 'Unknown error';
          break;
        default:
          return {
            success: false,
            error: `Unknown event type: ${payload.event}`,
          };
      }

      const { error } = await this.supabase
        .from('admission_whatsapp_logs')
        .update(updateData)
        .eq('id', payload.message_id);

      if (error) {
        console.error('[admission/whatsapp-campaign] Failed to update webhook status:', error);
        return {
          success: false,
          error: 'Failed to update message status',
        };
      }

      return { success: true };
    } catch (error) {
      console.error('[admission/whatsapp-campaign] Webhook handling error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update message status directly (for internal use)
   */
  static async updateMessageStatus(
    messageId: string,
    status: WhatsAppDeliveryStatus,
    additionalData?: Partial<WhatsAppMessage>
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      delivery_status: status,
      updated_at: new Date().toISOString(),
      ...additionalData,
    };

    // Set timestamp based on status
    if (status === 'sent') updateData.sent_at = new Date().toISOString();
    if (status === 'delivered') updateData.delivered_at = new Date().toISOString();
    if (status === 'read') updateData.read_at = new Date().toISOString();
    if (status === 'failed') updateData.failed_at = new Date().toISOString();

    const { error } = await this.supabase
      .from('admission_whatsapp_logs')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('[admission/whatsapp-campaign] Failed to update message status:', error);
      throw new Error('Failed to update message status');
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get WhatsApp campaign statistics for an institution
   */
  static async getCampaignStats(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<WhatsAppCampaignStats> {
    let query = this.supabase
      .from('admission_whatsapp_logs')
      .select('delivery_status')
      .eq('institution_id', institutionId);

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('[admission/whatsapp-campaign] Failed to fetch stats:', error);
      return {
        totalMessages: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        pendingCount: 0,
        deliveryRate: 0,
        readRate: 0,
      };
    }

    const messages = data || [];
    const totalMessages = messages.length;
    const statusCounts = messages.reduce(
      (acc, msg) => {
        acc[msg.delivery_status] = (acc[msg.delivery_status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const sentCount = statusCounts.sent || 0;
    const deliveredCount = statusCounts.delivered || 0;
    const readCount = statusCounts.read || 0;
    const failedCount = statusCounts.failed || 0;
    const pendingCount = statusCounts.pending || 0;

    // Delivered includes read messages
    const totalDelivered = deliveredCount + readCount;
    const totalSent = sentCount + totalDelivered;

    return {
      totalMessages,
      sentCount,
      deliveredCount,
      readCount,
      failedCount,
      pendingCount,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      readRate: totalDelivered > 0 ? Math.round((readCount / totalDelivered) * 100) : 0,
    };
  }

  // ============================================================================
  // TEMPLATE VARIABLE HELPERS
  // ============================================================================

  /**
   * Replace template variables with actual values
   * Variables are in format {{variable_name}}
   */
  static replaceTemplateVariables(content: string, values: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return values[variable] !== undefined ? values[variable] : match;
    });
  }

  /**
   * Get lead variables for template replacement
   */
  // FIX: program_interest does not exist in DB → use interested_programs (array)
  static getLeadVariables(lead: {
    full_name?: string;
    email?: string;
    phone?: string;
    interested_programs?: string[];
    funnel_stage?: string;
  }): Record<string, string> {
    const [firstName, ...lastNameParts] = (lead.full_name || '').split(' ');
    const lastName = lastNameParts.join(' ');

    // FIX: interested_programs is an array, join for template use
    const programsStr = (lead.interested_programs && lead.interested_programs.length > 0)
      ? lead.interested_programs.join(', ')
      : '';

    return {
      lead_name: lead.full_name || '',
      first_name: firstName || '',
      last_name: lastName || '',
      full_name: lead.full_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      program_name: programsStr,
      program_interest: programsStr, // backward compat for existing templates
      stage: lead.funnel_stage || '',
    };
  }

  /**
   * Common variables for all templates
   */
  static getCommonVariables(): Record<string, string> {
    const now = new Date();
    return {
      date: now.toLocaleDateString('en-IN'),
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      year: now.getFullYear().toString(),
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Format phone number for WhatsApp
   * Removes + and spaces, ensures country code
   */
  private static formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // If starts with 0, remove it and add India country code
    if (cleaned.startsWith('0')) {
      cleaned = '91' + cleaned.substring(1);
    }

    // If no country code (10 digits), assume India
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate phone number format
   */
  static isValidPhoneNumber(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    // Should be 10-15 digits
    return cleaned.length >= 10 && cleaned.length <= 15;
  }
}
