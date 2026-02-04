// app/api/webhooks/whatsapp/route.ts
// Webhook endpoint for WhatsApp delivery status updates

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role for webhook processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Webhook payload types
interface WebhookPayload {
  event: 'sent' | 'delivered' | 'read' | 'failed';
  message_id: string;
  timestamp: string;
  error?: string;
  whatsapp_message_id?: string;
  metadata?: Record<string, unknown>;
}

// Verify webhook signature (implementation depends on WhatsApp provider)
function verifyWebhookSignature(
  request: NextRequest,
  _payload: unknown
): boolean {
  const signature = request.headers.get('x-webhook-signature');
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

  // If no secret configured, skip verification (development mode)
  if (!webhookSecret) {
    console.warn('[whatsapp-webhook] No webhook secret configured, skipping verification');
    return true;
  }

  // If secret is configured but no signature provided, reject
  if (!signature) {
    console.error('[whatsapp-webhook] Missing webhook signature');
    return false;
  }

  // TODO: Implement actual signature verification based on WhatsApp provider
  // This would typically use HMAC-SHA256 with the webhook secret
  // For now, just check if signature is present
  return true;
}

// POST: Handle delivery status updates
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const payload: WebhookPayload = await request.json();

    // Verify webhook signature
    if (!verifyWebhookSignature(request, payload)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!payload.event || !payload.message_id) {
      return NextResponse.json(
        { error: 'Missing required fields: event and message_id' },
        { status: 400 }
      );
    }

    // Validate event type
    const validEvents = ['sent', 'delivered', 'read', 'failed'];
    if (!validEvents.includes(payload.event)) {
      return NextResponse.json(
        { error: `Invalid event type: ${payload.event}` },
        { status: 400 }
      );
    }

    // Build update data based on event type
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const timestamp = payload.timestamp || new Date().toISOString();

    switch (payload.event) {
      case 'sent':
        updateData.delivery_status = 'sent';
        updateData.sent_at = timestamp;
        if (payload.whatsapp_message_id) {
          updateData.whatsapp_message_id = payload.whatsapp_message_id;
        }
        break;
      case 'delivered':
        updateData.delivery_status = 'delivered';
        updateData.delivered_at = timestamp;
        break;
      case 'read':
        updateData.delivery_status = 'read';
        updateData.read_at = timestamp;
        break;
      case 'failed':
        updateData.delivery_status = 'failed';
        updateData.failed_at = timestamp;
        updateData.error_message = payload.error || 'Unknown error';
        break;
    }

    // Update the message record
    const { data, error } = await supabase
      .from('admission_whatsapp_logs')
      .update(updateData)
      .eq('id', payload.message_id)
      .select()
      .single();

    if (error) {
      // Check if message not found
      if (error.code === 'PGRST116') {
        console.warn('[whatsapp-webhook] Message not found:', payload.message_id);
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        );
      }

      console.error('[whatsapp-webhook] Failed to update message:', error);
      return NextResponse.json(
        { error: 'Failed to update message status' },
        { status: 500 }
      );
    }

    console.info(
      `[whatsapp-webhook] Updated message ${payload.message_id} to ${payload.event}`
    );

    return NextResponse.json({
      success: true,
      message_id: payload.message_id,
      status: payload.event,
      updated_at: data.updated_at,
    });
  } catch (error) {
    console.error('[whatsapp-webhook] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: Webhook verification endpoint (for provider setup)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Handle verification challenge (common pattern for webhook setup)
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // If this is a verification request
  if (mode === 'subscribe') {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      console.warn('[whatsapp-webhook] No verify token configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    if (token === verifyToken) {
      console.info('[whatsapp-webhook] Webhook verified successfully');
      // Return the challenge as plain text
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      console.error('[whatsapp-webhook] Invalid verify token');
      return NextResponse.json(
        { error: 'Invalid verify token' },
        { status: 403 }
      );
    }
  }

  // Default response for status check
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/whatsapp',
    supported_events: ['sent', 'delivered', 'read', 'failed'],
  });
}
