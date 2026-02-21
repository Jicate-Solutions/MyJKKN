// lib/services/email/email-service.ts
// Email sending service using Resend.
// Integrates with existing communication templates system.
// Pattern: Static-method class matching AdmissionAIService pattern.
// Template variables: {{variable_name}} format (same as existing templates).

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { CommunicationTemplatesService } from '@/lib/services/admission/communication-templates-service';

// ============================================================================
// TYPES
// ============================================================================

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  reply_to?: string;
  cc?: string[];
  bcc?: string[];
  tags?: { name: string; value: string }[];
  metadata?: {
    lead_id?: string;
    campaign_id?: string;
    template_id?: string;
    institution_id?: string;
  };
}

export interface SendTemplateEmailParams {
  to: string | string[];
  template_id: string;
  variables: Record<string, string>;
  institution_id: string;
  lead_id?: string;
  campaign_id?: string;
}

export interface EmailSendResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class EmailService {
  private static resend: Resend | null = null;

  private static getResend(): Resend {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY is not configured');
      }
      this.resend = new Resend(apiKey);
    }
    return this.resend;
  }

  private static getSupabase() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  private static getDefaultFrom(): string {
    const name = process.env.RESEND_FROM_NAME || 'JKKN Admissions';
    const email = process.env.RESEND_FROM_EMAIL || 'admissions@jkkn.ac.in';
    return `${name} <${email}>`;
  }

  private static getDefaultReplyTo(): string {
    return process.env.RESEND_REPLY_TO || process.env.RESEND_FROM_EMAIL || 'admissions@jkkn.ac.in';
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Check if the email service is configured
   */
  static isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  /**
   * Send a raw email with provided HTML content
   */
  static async sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Email service is not configured (missing RESEND_API_KEY)' };
    }

    try {
      const resend = this.getResend();

      const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

      const { data, error } = await resend.emails.send({
        from: params.from || this.getDefaultFrom(),
        to: toAddresses,
        subject: params.subject,
        html: params.html,
        replyTo: params.reply_to || this.getDefaultReplyTo(),
        cc: params.cc,
        bcc: params.bcc,
        tags: params.tags,
      });

      if (error) {
        console.error('[email-service] Resend API error:', error);
        return { success: false, error: error.message };
      }

      const messageId = data?.id || undefined;

      // Log to admission_email_logs if metadata is provided
      if (params.metadata?.institution_id) {
        await this.logEmail({
          institution_id: params.metadata.institution_id,
          lead_id: params.metadata.lead_id || null,
          campaign_id: params.metadata.campaign_id || null,
          template_id: params.metadata.template_id || null,
          to_email: toAddresses[0],
          from_email: params.from || this.getDefaultFrom(),
          subject: params.subject,
          resend_message_id: messageId || null,
          status: 'sent',
          tags: params.tags || [],
          metadata: params.metadata,
        });
      }

      return { success: true, message_id: messageId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown email send error';
      console.error('[email-service] Send email failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send an email using a communication template with variable replacement
   */
  static async sendTemplateEmail(params: SendTemplateEmailParams): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Email service is not configured (missing RESEND_API_KEY)' };
    }

    try {
      // Fetch the template
      const template = await CommunicationTemplatesService.getTemplate(params.template_id);

      if (!template) {
        return { success: false, error: `Template not found: ${params.template_id}` };
      }

      if (template.channel !== 'email') {
        return { success: false, error: `Template is not an email template (channel: ${template.channel})` };
      }

      // Replace variables in content and subject
      const htmlContent = CommunicationTemplatesService.replaceVariables(
        template.content,
        params.variables
      );

      const subject = template.subject
        ? CommunicationTemplatesService.replaceVariables(template.subject, params.variables)
        : 'Message from JKKN Admissions';

      // Send the email
      return await this.sendEmail({
        to: params.to,
        subject,
        html: htmlContent,
        tags: [
          { name: 'template_id', value: params.template_id },
          { name: 'institution_id', value: params.institution_id },
        ],
        metadata: {
          lead_id: params.lead_id,
          campaign_id: params.campaign_id,
          template_id: params.template_id,
          institution_id: params.institution_id,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown template email error';
      console.error('[email-service] Send template email failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send bulk emails with rate limiting (10/second for Resend free tier)
   */
  static async sendBulkEmail(recipients: SendTemplateEmailParams[]): Promise<EmailSendResult[]> {
    if (!this.isConfigured()) {
      return recipients.map(() => ({
        success: false,
        error: 'Email service is not configured (missing RESEND_API_KEY)',
      }));
    }

    const results: EmailSendResult[] = [];
    const BATCH_SIZE = 10;
    const DELAY_MS = 1100; // slightly over 1 second to respect 10/sec rate limit

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Send batch in parallel
      const batchResults = await Promise.all(
        batch.map((recipient) => this.sendTemplateEmail(recipient))
      );

      results.push(...batchResults);

      // Wait before next batch (skip delay for the last batch)
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    return results;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Log an email send to admission_email_logs
   */
  private static async logEmail(logData: {
    institution_id: string;
    lead_id: string | null;
    campaign_id: string | null;
    template_id: string | null;
    to_email: string;
    from_email: string;
    subject: string;
    resend_message_id: string | null;
    status: string;
    tags: { name: string; value: string }[];
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      const supabase = this.getSupabase();

      const { error } = await supabase
        .from('admission_email_logs')
        .insert({
          institution_id: logData.institution_id,
          lead_id: logData.lead_id,
          campaign_id: logData.campaign_id,
          template_id: logData.template_id,
          to_email: logData.to_email,
          from_email: logData.from_email,
          subject: logData.subject,
          resend_message_id: logData.resend_message_id,
          status: logData.status,
          tags: logData.tags,
          metadata: logData.metadata,
        });

      if (error) {
        console.error('[email-service] Failed to log email:', error);
      }
    } catch (err) {
      // Don't let logging failures block email sending
      console.error('[email-service] Email logging error:', err);
    }
  }
}
