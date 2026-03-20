// app/api/admission/email/send/route.ts
// POST endpoint to send a single email via template
// Body: { to, template_id, variables, lead_id?, institution_id }

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
    const { to, template_id, variables, lead_id, institution_id } = body;

    // Validate required fields
    if (!to || !template_id || !institution_id) {
      return NextResponse.json(
        { error: 'Missing required fields: to, template_id, institution_id' },
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

    // Send template email
    const result = await EmailService.sendTemplateEmail({
      to,
      template_id,
      variables: variables || {},
      institution_id,
      lead_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message_id: result.message_id,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('[api/admission/email/send] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
