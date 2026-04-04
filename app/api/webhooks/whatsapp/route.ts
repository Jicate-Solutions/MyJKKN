import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';
import { logger } from '@/lib/utils/enhanced-logger';

// =============================================================================
// Service-role Supabase client (webhook has no user session)
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// HMAC-SHA256 signature verification (Meta App Secret)
// =============================================================================

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!appSecret) {
    logger.warn('admissions/wa-webhook', 'WHATSAPP_WEBHOOK_SECRET not set — skipping signature check');
    return true; // Allow in dev; enforce in production
  }

  if (!signatureHeader) {
    logger.warn('admissions/wa-webhook', 'Missing X-Hub-Signature-256 header');
    return false;
  }

  // Meta sends: sha256=<hex>
  const expectedSig = signatureHeader.replace('sha256=', '');
  const computedSig = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf-8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(computedSig, 'hex')
    );
  } catch {
    return false;
  }
}

// =============================================================================
// Resolve institution_id from Meta phone_number_id
// =============================================================================

async function resolveInstitution(phoneNumberId: string): Promise<string | null> {
  const supabase = getServiceClient();

  // First: look up wa_phone_numbers table
  const { data } = await supabase
    .from('wa_phone_numbers')
    .select('institution_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (data?.institution_id) return data.institution_id;

  // Fallback: if env var matches and only one institution, use it
  if (phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id')
      .limit(2);

    if (institutions?.length === 1) return institutions[0].id;
  }

  return null;
}

// =============================================================================
// GET — Meta Webhook Verification (challenge-response handshake)
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('admissions/wa-webhook', 'Webhook verification succeeded');
    // Meta expects the challenge value back as plain text
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn('admissions/wa-webhook', 'Webhook verification failed', {
    mode,
    tokenMatch: token === verifyToken,
  });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// =============================================================================
// POST — Receive WhatsApp webhook events from Meta / Exotel BSP
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for signature verification
  const rawBody = await request.text();

  // 2. Verify HMAC signature
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    logger.warn('admissions/wa-webhook', 'Invalid webhook signature — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse JSON payload
  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error('admissions/wa-webhook', 'Failed to parse webhook JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 4. Validate it's a WhatsApp Business Account event
  if (payload.object !== 'whatsapp_business_account') {
    logger.info('admissions/wa-webhook', 'Ignoring non-WhatsApp event', { object: payload.object });
    return NextResponse.json({ received: true });
  }

  // 5. Respond 200 immediately — Meta retries if no 200 within 20s
  const response = NextResponse.json({ received: true }, { status: 200 });

  // 6. Process in background (Vercel waitUntil or sync fallback)
  const processEvents = async () => {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;

        if (!phoneNumberId) {
          logger.warn('admissions/wa-webhook', 'Missing phone_number_id in webhook');
          continue;
        }

        // Resolve institution
        const institutionId = await resolveInstitution(phoneNumberId);
        if (!institutionId) {
          logger.warn('admissions/wa-webhook', 'No institution found for phone_number_id', { phoneNumberId });
          continue;
        }

        // Process inbound messages
        if (value.messages?.length) {
          const contactMap = new Map<string, string>();
          for (const contact of value.contacts || []) {
            contactMap.set(contact.wa_id, contact.profile?.name || '');
          }

          for (const msg of value.messages) {
            try {
              await processInboundMessage(msg, institutionId, contactMap);
            } catch (err) {
              logger.error('admissions/wa-webhook', 'Failed to process inbound message', {
                messageId: msg.id,
                error: String(err),
              });
            }
          }
        }

        // Process message status updates
        if (value.statuses?.length) {
          for (const status of value.statuses) {
            try {
              await processStatusUpdate(status);
            } catch (err) {
              logger.error('admissions/wa-webhook', 'Failed to process status update', {
                messageId: status.id,
                error: String(err),
              });
            }
          }
        }
      }
    }
  };

  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(processEvents());
  } catch {
    // Non-Vercel environment — process synchronously
    await processEvents();
  }

  return response;
}

// =============================================================================
// Message Processing Helpers
// =============================================================================

async function processInboundMessage(
  msg: MetaMessage,
  institutionId: string,
  contactMap: Map<string, string>
) {
  const contactName = contactMap.get(msg.from) || undefined;

  logger.info('admissions/wa-webhook', 'Processing inbound message', {
    from: msg.from,
    type: msg.type,
    messageId: msg.id,
  });

  // Extract content based on message type
  const params: Parameters<typeof WhatsAppChatService.handleInboundMessage>[0] = {
    institution_id: institutionId,
    from: msg.from,
    wa_id: msg.from,
    timestamp: msg.timestamp,
    message_id: msg.id,
    type: msg.type,
    name: contactName,
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

    case 'audio':
      params.media_id = msg.audio?.id;
      params.media_mime_type = msg.audio?.mime_type;
      break;

    case 'document':
      params.media_id = msg.document?.id;
      params.media_mime_type = msg.document?.mime_type;
      params.filename = msg.document?.filename;
      params.caption = msg.document?.caption;
      break;

    case 'location':
      params.latitude = msg.location?.latitude;
      params.longitude = msg.location?.longitude;
      params.text = msg.location?.name || msg.location?.address;
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
      // Template quick-reply button response
      params.text = msg.button?.text;
      break;

    case 'reaction':
      // Skip reaction events for now
      logger.info('admissions/wa-webhook', 'Skipping reaction event', { messageId: msg.id });
      return;

    default:
      params.text = `[Unsupported message type: ${msg.type}]`;
      break;
  }

  await WhatsAppChatService.handleInboundMessage(params);
}

async function processStatusUpdate(status: MetaStatus) {
  const supabase = getServiceClient();

  // Map Meta status to our status
  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };

  const mappedStatus = statusMap[status.status];
  if (!mappedStatus) return;

  // Update the message record by wa_message_id
  const { error } = await supabase
    .from('wa_messages')
    .update({ status: mappedStatus })
    .eq('wa_message_id', status.id);

  if (error) {
    logger.warn('admissions/wa-webhook', 'Failed to update message status', {
      waMessageId: status.id,
      status: mappedStatus,
      error: error.message,
    });
  } else {
    logger.info('admissions/wa-webhook', 'Message status updated', {
      waMessageId: status.id,
      status: mappedStatus,
    });
  }

  // Log delivery errors
  if (status.status === 'failed' && status.errors?.length) {
    for (const err of status.errors) {
      logger.error('admissions/wa-webhook', 'Message delivery failed', {
        waMessageId: status.id,
        errorCode: err.code,
        errorTitle: err.title,
        errorMessage: err.message,
      });
    }

    // Store error message on the record
    const errorMsg = status.errors.map((e) => `${e.code}: ${e.title}`).join('; ');
    await supabase
      .from('wa_messages')
      .update({ error_message: errorMsg })
      .eq('wa_message_id', status.id);
  }
}

// =============================================================================
// Meta WhatsApp Webhook Types
// =============================================================================

interface MetaWebhookPayload {
  object: string;
  entry: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

interface MetaChange {
  value: MetaChangeValue;
  field: string;
}

interface MetaChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
  errors?: MetaError[];
}

interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256?: string; caption?: string };
  video?: { id: string; mime_type: string; sha256?: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256?: string; voice?: boolean };
  document?: { id: string; mime_type: string; sha256?: string; filename?: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
  referral?: { source_url: string; source_type: string; headline?: string; body?: string };
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: MetaError[];
}

interface MetaError {
  code: number;
  title: string;
  message: string;
  error_data?: { details: string };
}
