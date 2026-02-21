// app/api/webhooks/email/route.ts
// Resend webhook handler for email delivery events
// Handles: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
// Verification: svix-id, svix-timestamp, svix-signature headers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Create Supabase client with service role for webhook processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Bounce/complaint-specific fields
    bounce?: {
      message: string;
    };
    click?: {
      link: string;
      timestamp: string;
    };
  };
}

// ============================================================================
// WEBHOOK VERIFICATION
// ============================================================================

function verifyWebhookSignature(
  request: NextRequest,
  rawBody: string
): boolean {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  // If no secret configured, skip verification (development mode)
  if (!webhookSecret) {
    console.warn('[email-webhook] No webhook secret configured, skipping verification');
    return true;
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[email-webhook] Missing svix headers');
    return false;
  }

  // Check timestamp is within 5 minutes
  const timestampSeconds = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > 300) {
    console.error('[email-webhook] Timestamp too old');
    return false;
  }

  // Verify signature
  // Resend uses svix with base64 secret prefixed with "whsec_"
  const secret = webhookSecret.startsWith('whsec_')
    ? webhookSecret.slice(6)
    : webhookSecret;

  const secretBytes = Buffer.from(secret, 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // svix-signature can contain multiple signatures separated by space
  const signatures = svixSignature.split(' ');
  const isValid = signatures.some((sig) => {
    const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
    return sigValue === expectedSignature;
  });

  if (!isValid) {
    console.error('[email-webhook] Invalid signature');
  }

  return isValid;
}

// ============================================================================
// POST: Handle Resend delivery events
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature
    if (!verifyWebhookSignature(request, rawBody)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const payload: ResendWebhookPayload = JSON.parse(rawBody);

    // Validate required fields
    if (!payload.type || !payload.data?.email_id) {
      return NextResponse.json(
        { error: 'Missing required fields: type and data.email_id' },
        { status: 400 }
      );
    }

    const emailId = payload.data.email_id;
    const timestamp = payload.created_at || new Date().toISOString();

    // Build update data based on event type
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    switch (payload.type) {
      case 'email.sent':
        updateData.status = 'sent';
        break;

      case 'email.delivered':
        updateData.status = 'delivered';
        break;

      case 'email.opened':
        updateData.status = 'opened';
        updateData.opened_at = timestamp;
        break;

      case 'email.clicked':
        updateData.status = 'clicked';
        updateData.clicked_at = timestamp;
        break;

      case 'email.bounced':
        updateData.status = 'bounced';
        updateData.bounced_at = timestamp;
        updateData.error_message = payload.data.bounce?.message || 'Email bounced';
        break;

      case 'email.complained':
        updateData.status = 'complained';
        updateData.error_message = 'Recipient marked as spam';
        break;

      default:
        // Unknown event type - acknowledge but don't process
        console.info(`[email-webhook] Ignoring unknown event type: ${payload.type}`);
        return NextResponse.json({ received: true, processed: false });
    }

    // Update the email log record by resend_message_id
    const { data, error } = await supabase
      .from('admission_email_logs')
      .update(updateData)
      .eq('resend_message_id', emailId)
      .select('id, status')
      .maybeSingle();

    if (error) {
      console.error('[email-webhook] Failed to update email log:', error);
      // Return 200 to prevent Resend from retrying
      return NextResponse.json({
        received: true,
        processed: false,
        error: 'Failed to update email log',
      });
    }

    if (!data) {
      // Email log not found - might be sent without logging or from another system
      console.warn(`[email-webhook] Email log not found for resend_message_id: ${emailId}`);
      return NextResponse.json({ received: true, processed: false });
    }

    console.info(`[email-webhook] Updated email ${data.id} to ${updateData.status}`);

    return NextResponse.json({
      received: true,
      processed: true,
      email_log_id: data.id,
      status: updateData.status,
    });
  } catch (error) {
    console.error('[email-webhook] Error processing webhook:', error);
    // Return 200 to prevent infinite retries
    return NextResponse.json(
      {
        received: true,
        processed: false,
        error: error instanceof Error ? error.message : 'Internal error',
      },
      { status: 200 }
    );
  }
}

// ============================================================================
// GET: Health check endpoint
// ============================================================================

export async function GET() {
  const configured = !!process.env.RESEND_API_KEY;
  const webhookSecretSet = !!process.env.RESEND_WEBHOOK_SECRET;

  return NextResponse.json({
    service: 'Email Delivery Webhook (Resend)',
    status: 'active',
    endpoint: '/api/webhooks/email',
    methods: ['POST'],
    configured,
    webhook_secret_set: webhookSecretSet,
    supported_events: [
      'email.sent',
      'email.delivered',
      'email.opened',
      'email.clicked',
      'email.bounced',
      'email.complained',
    ],
  });
}
