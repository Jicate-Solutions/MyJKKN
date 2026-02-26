// app/api/admission/email/send-bulk/route.ts
// POST endpoint for batch email sending
// Body: { recipients: [{ to, template_id, variables, lead_id }], institution_id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EmailService } from '@/lib/services/email/email-service';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { recipients, institution_id } = body;

    // Validate required fields
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty recipients array' },
        { status: 400 }
      );
    }

    if (!institution_id) {
      return NextResponse.json(
        { error: 'Missing required field: institution_id' },
        { status: 400 }
      );
    }

    // Cap batch size to prevent abuse
    const MAX_BATCH_SIZE = 500;
    if (recipients.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} recipients` },
        { status: 400 }
      );
    }

    // Check if email service is configured
    if (!EmailService.isConfigured()) {
      return NextResponse.json(
        { error: 'Email service is not configured. Please set RESEND_API_KEY.' },
        { status: 503 }
      );
    }

    // Verify user has access to the institution
    const { data: access, error: accessError } = await supabase
      .from('user_institution_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('institution_id', institution_id)
      .maybeSingle();

    if (accessError || !access) {
      return NextResponse.json(
        { error: 'You do not have access to this institution' },
        { status: 403 }
      );
    }

    // Validate each recipient has required fields
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      if (!r.to || !r.template_id) {
        return NextResponse.json(
          { error: `Recipient at index ${i} missing required fields: to, template_id` },
          { status: 400 }
        );
      }
    }

    // Enrich recipients with institution_id
    const enrichedRecipients = recipients.map((r: {
      to: string | string[];
      template_id: string;
      variables?: Record<string, string>;
      lead_id?: string;
      campaign_id?: string;
    }) => ({
      to: r.to,
      template_id: r.template_id,
      variables: r.variables || {},
      institution_id,
      lead_id: r.lead_id,
      campaign_id: r.campaign_id,
    }));

    // Send bulk emails
    const results = await EmailService.sendBulkEmail(enrichedRecipients);

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent,
      failed,
      results: results.map((r, i) => ({
        index: i,
        to: recipients[i].to,
        success: r.success,
        message_id: r.message_id,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('[api/admission/email/send-bulk] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
