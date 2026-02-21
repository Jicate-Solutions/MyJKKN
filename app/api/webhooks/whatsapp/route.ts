// app/api/webhooks/whatsapp/route.ts
// Webhook endpoint for Meta WhatsApp Cloud API
// Handles: inbound messages, delivery status updates, webhook verification

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';
import crypto from 'crypto';

// Service role client for webhook processing (no user auth context)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// =============================================================================
// Meta Webhook Payload Types
// =============================================================================

interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

interface MetaWebhookChange {
  value: {
    messaging_product: 'whatsapp';
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: {
      profile: { name: string };
      wa_id: string;
    }[];
    messages?: MetaInboundMessage[];
    statuses?: MetaStatusUpdate[];
    errors?: MetaWebhookError[];
  };
  field: string;
}

interface MetaInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'location' | 'contacts' | 'interactive' | 'button' | 'reaction' | 'sticker';
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  sticker?: { id: string; mime_type: string; sha256: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
}

interface MetaStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin?: { type: string };
  };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: { code: number; title: string; message: string; error_data?: { details: string } }[];
}

interface MetaWebhookError {
  code: number;
  title: string;
  message: string;
  error_data?: { details: string };
}

// =============================================================================
// Signature Verification
// =============================================================================

function verifyWebhookSignature(request: NextRequest, rawBody: string): boolean {
  const appSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

  // Skip verification in development if no secret configured
  if (!appSecret) {
    console.warn('[wa-webhook] No webhook secret configured, skipping signature verification');
    return true;
  }

  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) {
    console.error('[wa-webhook] Missing x-hub-signature-256 header');
    return false;
  }

  const expectedSignature =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// =============================================================================
// Resolve institution ID from phone_number_id
// =============================================================================

async function resolveInstitutionId(phoneNumberId: string): Promise<string | null> {
  // For now, use the single configured phone number ID
  // In multi-tenant mode, this would look up which institution owns this phone number
  const configuredId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (phoneNumberId === configuredId) {
    // Look up from wa_connections or settings, or use a default institution
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('institutions')
      .select('id')
      .limit(1)
      .single();

    return data?.id || null;
  }

  return null;
}

// =============================================================================
// POST: Handle incoming webhooks from Meta
// =============================================================================

export async function POST(request: NextRequest) {
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Verify signature
  if (!verifyWebhookSignature(request, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { object: string; entry: MetaWebhookEntry[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Meta sends a "whatsapp_business_account" object
  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ error: 'Unknown object type' }, { status: 400 });
  }

  // Process each entry
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Resolve institution
      const institutionId = await resolveInstitutionId(phoneNumberId);
      if (!institutionId) {
        console.warn(`[wa-webhook] Unknown phone_number_id: ${phoneNumberId}`);
        continue;
      }

      // Handle inbound messages
      if (value.messages) {
        for (const msg of value.messages) {
          try {
            const contactInfo = value.contacts?.[0];

            // Extract message content based on type
            const params: Parameters<typeof WhatsAppChatService.handleInboundMessage>[0] = {
              institution_id: institutionId,
              from: msg.from,
              wa_id: contactInfo?.wa_id || msg.from,
              timestamp: msg.timestamp,
              message_id: msg.id,
              type: msg.type,
              name: contactInfo?.profile?.name,
            };

            switch (msg.type) {
              case 'text':
                params.text = msg.text?.body;
                break;

              case 'image':
                params.media_id = msg.image?.id;
                params.media_mime_type = msg.image?.mime_type;
                params.caption = msg.image?.caption;
                break;

              case 'video':
                params.media_id = msg.video?.id;
                params.media_mime_type = msg.video?.mime_type;
                params.caption = msg.video?.caption;
                break;

              case 'document':
                params.media_id = msg.document?.id;
                params.media_mime_type = msg.document?.mime_type;
                params.filename = msg.document?.filename;
                params.caption = msg.document?.caption;
                break;

              case 'audio':
                params.media_id = msg.audio?.id;
                params.media_mime_type = msg.audio?.mime_type;
                break;

              case 'sticker':
                params.media_id = msg.sticker?.id;
                params.media_mime_type = msg.sticker?.mime_type;
                break;

              case 'location':
                params.latitude = msg.location?.latitude;
                params.longitude = msg.location?.longitude;
                params.text = msg.location?.name
                  ? `${msg.location.name}${msg.location.address ? ` - ${msg.location.address}` : ''}`
                  : undefined;
                break;

              case 'interactive':
                if (msg.interactive?.type === 'button_reply') {
                  params.button_reply = msg.interactive.button_reply;
                  params.text = msg.interactive.button_reply?.title;
                } else if (msg.interactive?.type === 'list_reply') {
                  params.list_reply = msg.interactive.list_reply;
                  params.text = msg.interactive.list_reply?.title;
                }
                break;

              case 'button':
                params.text = msg.button?.text;
                break;

              case 'reaction':
                params.text = msg.reaction?.emoji;
                params.type = 'reaction';
                break;
            }

            await WhatsAppChatService.handleInboundMessage(params);

            console.info(
              `[wa-webhook] Processed inbound ${msg.type} from ${msg.from}`
            );
          } catch (error) {
            console.error(
              `[wa-webhook] Error processing inbound message ${msg.id}:`,
              error
            );
          }
        }
      }

      // Handle delivery status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          try {
            const errorMessage =
              status.errors?.[0]?.message || undefined;

            await WhatsAppChatService.updateMessageStatus(
              status.id,
              status.status,
              errorMessage
            );

            // Also update old admission_whatsapp_logs table for backward compat
            const supabase = getServiceClient();
            const updateData: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            };

            const timestamp = new Date(
              parseInt(status.timestamp) * 1000
            ).toISOString();

            switch (status.status) {
              case 'sent':
                updateData.delivery_status = 'sent';
                updateData.sent_at = timestamp;
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
                updateData.error_message = errorMessage || 'Unknown error';
                break;
            }

            // Try updating the old log table (may not find a match, that's OK)
            await supabase
              .from('admission_whatsapp_logs')
              .update(updateData)
              .eq('whatsapp_message_id', status.id);

            console.info(
              `[wa-webhook] Status update: ${status.id} → ${status.status}`
            );
          } catch (error) {
            console.error(
              `[wa-webhook] Error processing status ${status.id}:`,
              error
            );
          }
        }
      }

      // Log errors from Meta
      if (value.errors) {
        for (const err of value.errors) {
          console.error(
            `[wa-webhook] Meta error: ${err.code} - ${err.title}: ${err.message}`
          );
        }
      }
    }
  }

  // Meta requires 200 OK response
  return NextResponse.json({ status: 'ok' });
}

// =============================================================================
// GET: Webhook verification endpoint (Meta sends this during setup)
// =============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe') {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      console.warn('[wa-webhook] No verify token configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    if (token === verifyToken) {
      console.info('[wa-webhook] Webhook verified successfully');
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      console.error('[wa-webhook] Invalid verify token');
      return NextResponse.json(
        { error: 'Invalid verify token' },
        { status: 403 }
      );
    }
  }

  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/whatsapp',
    supported_events: ['messages', 'statuses'],
  });
}
