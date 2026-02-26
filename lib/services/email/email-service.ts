// lib/services/email/email-service.ts
// Minimal email service stub — delegates to Resend (or any transactional provider).
// Full implementation to be added when email sending is wired up.

export interface SendTemplateEmailInput {
  to: string | string[];
  template_id: string;
  variables: Record<string, string>;
  institution_id: string;
  lead_id?: string;
  campaign_id?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  message_id?: string;
}

export class EmailService {
  /**
   * Returns true when the required environment variable(s) for the email
   * provider are present (e.g. RESEND_API_KEY).
   */
  static isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  /**
   * Send an email using a pre-defined template.
   * Currently a stub — returns a not-configured error until the provider is wired up.
   */
  static async sendTemplateEmail(
    input: SendTemplateEmailInput
  ): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Email service not configured (missing RESEND_API_KEY)',
      };
    }

    // TODO: Implement actual email sending via Resend / other provider
    console.warn(
      '[email-service] sendTemplateEmail called but provider integration is not yet implemented',
      { to: input.to, template_id: input.template_id }
    );

    return {
      success: false,
      error: 'Email provider integration not yet implemented',
    };
  }

  /**
   * Send bulk emails using pre-defined templates.
   * Currently a stub — returns not-configured errors until the provider is wired up.
   */
  static async sendBulkEmail(
    recipients: SendTemplateEmailInput[]
  ): Promise<SendEmailResult[]> {
    if (!this.isConfigured()) {
      return recipients.map(() => ({
        success: false,
        error: 'Email service not configured (missing RESEND_API_KEY)',
      }));
    }

    // TODO: Implement actual bulk email sending via Resend / other provider
    console.warn(
      '[email-service] sendBulkEmail called but provider integration is not yet implemented',
      { count: recipients.length }
    );

    return recipients.map(() => ({
      success: false,
      error: 'Email provider integration not yet implemented',
    }));
  }
}
