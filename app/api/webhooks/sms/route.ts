// app/api/webhooks/sms/route.ts
// SMS Delivery Webhook Handler - Exotel, MSG91 & Twilio Support
// POST /api/webhooks/sms?provider=exotel|msg91|twilio

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  SMSCampaignService,
  type SMSProvider,
  type SMSWebhookPayload,
} from '@/lib/services/admission/sms-campaign-service';

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get provider from query string
    const provider = (request.nextUrl.searchParams.get('provider') || 'exotel') as SMSProvider;

    logger.info('admission/sms-webhook', 'Received SMS webhook', { provider });

    // ========================================================================
    // STEP 1: Verify Authentication
    // ========================================================================
    const isAuthenticated = await verifyWebhookAuth(request, provider);

    if (!isAuthenticated) {
      logger.error('admission/sms-webhook', 'Webhook authentication failed', { provider });
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Invalid webhook authentication' },
        { status: 401 }
      );
    }

    // ========================================================================
    // STEP 2: Parse Webhook Payload
    // ========================================================================
    let payload: SMSWebhookPayload;

    if (provider === 'msg91') {
      // MSG91 can send as form data or JSON
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        const data: Record<string, FormDataEntryValue> = {};
        formData.forEach((value, key) => {
          data[key] = value;
        });

        // MSG91 sends data as nested JSON string sometimes
        if (typeof data.data === 'string') {
          payload = { data: JSON.parse(data.data as string) };
        } else {
          payload = { data: data as unknown as SMSWebhookPayload['data'] };
        }
      } else {
        payload = await request.json();
      }
    } else if (provider === 'exotel') {
      // Exotel sends as form data
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        const data: Record<string, string> = {};
        formData.forEach((value, key) => {
          data[key] = value.toString();
        });
        payload = data as unknown as SMSWebhookPayload;
      } else {
        payload = await request.json();
      }
    } else {
      // Twilio sends as form data
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        const data: Record<string, FormDataEntryValue> = {};
        formData.forEach((value, key) => {
          data[key] = value;
        });
        payload = data as unknown as SMSWebhookPayload;
      } else {
        payload = await request.json();
      }
    }

    logger.info('admission/sms-webhook', 'Processing webhook payload', {
      provider,
      hasData: !!payload,
      messageId: provider === 'msg91' ? payload.data?.requestId : (provider === 'exotel' ? payload.SmsSid : payload.MessageSid),
    });

    // ========================================================================
    // STEP 3: Process Webhook
    // ========================================================================
    const result = await SMSCampaignService.handleWebhook(provider, payload);

    const processingTime = Date.now() - startTime;

    if (!result.success) {
      logger.error('admission/sms-webhook', 'Webhook processing failed', {
        error: result.error,
        processingTimeMs: processingTime,
      });

      // Return 200 to acknowledge receipt even if processing failed
      // This prevents providers from retrying indefinitely
      return NextResponse.json(
        {
          received: true,
          processed: false,
          error: result.error,
        },
        { status: 200 }
      );
    }

    logger.info('admission/sms-webhook', 'Webhook processed successfully', {
      provider,
      updated: result.updated,
      processingTimeMs: processingTime,
    });

    return NextResponse.json(
      {
        received: true,
        processed: true,
        updated: result.updated,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('admission/sms-webhook', 'Webhook endpoint error', error);

    // Return 200 to prevent retries
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
// AUTHENTICATION
// ============================================================================

/**
 * Verify webhook authentication based on provider.
 * SECURITY: Rejects requests when auth credentials are not configured.
 */
async function verifyWebhookAuth(request: NextRequest, provider: SMSProvider): Promise<boolean> {
  if (provider === 'exotel') {
    const expectedToken = process.env.EXOTEL_API_TOKEN;

    if (!expectedToken) {
      logger.error('admission/sms-webhook', 'EXOTEL_API_TOKEN not configured — rejecting request');
      return false;
    }

    // Check for token in Exotel header formats
    const apiToken = request.headers.get('x-exotel-token') || request.headers.get('x-api-token');

    if (apiToken && apiToken.length === expectedToken.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(apiToken), Buffer.from(expectedToken))) {
          return true;
        }
      } catch {
        // Length mismatch
      }
    }

    // Fallback: check query param token
    const tokenParam = request.nextUrl.searchParams.get('token');
    if (tokenParam && tokenParam.length === expectedToken.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(tokenParam), Buffer.from(expectedToken))) {
          return true;
        }
      } catch {
        // Length mismatch
      }
    }

    logger.warn('admission/sms-webhook', 'Exotel SMS webhook authentication failed');
    return false;
  }

  if (provider === 'msg91') {
    const authKey = request.headers.get('authkey') || request.headers.get('x-authkey');
    const expectedKey = process.env.MSG91_WEBHOOK_AUTH_KEY;

    // SECURITY: Reject if auth key is not configured — never allow unauthenticated requests
    if (!expectedKey) {
      logger.error('admission/sms-webhook', 'MSG91_WEBHOOK_AUTH_KEY not configured — rejecting request');
      return false;
    }

    if (!authKey) {
      logger.warn('admission/sms-webhook', 'MSG91 webhook missing authkey header');
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    if (authKey.length !== expectedKey.length) return false;
    return crypto.timingSafeEqual(Buffer.from(authKey), Buffer.from(expectedKey));
  }

  if (provider === 'twilio') {
    const signature = request.headers.get('x-twilio-signature');
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    // SECURITY: Reject if auth token is not configured — never allow unauthenticated requests
    if (!twilioAuthToken) {
      logger.error('admission/sms-webhook', 'TWILIO_AUTH_TOKEN not configured — rejecting request');
      return false;
    }

    if (!signature) {
      logger.warn('admission/sms-webhook', 'Twilio webhook missing x-twilio-signature header');
      return false;
    }

    // Twilio signature validation per https://www.twilio.com/docs/usage/security#validating-requests
    // 1. Build the full URL Twilio used to call this webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'}/api/webhooks/sms?provider=twilio`;

    // 2. Get POST parameters sorted alphabetically and concatenated
    let paramString = '';
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // Clone the request to avoid consuming the body (caller will read it again)
        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();
        const params: Record<string, string> = {};
        formData.forEach((value, key) => {
          params[key] = value.toString();
        });
        // Sort keys alphabetically and concatenate key+value
        const sortedKeys = Object.keys(params).sort();
        paramString = sortedKeys.map(key => key + params[key]).join('');
      }
    } catch (e) {
      logger.error('admission/sms-webhook', 'Failed to parse Twilio form data for signature validation', e);
      return false;
    }

    // 3. Compute HMAC-SHA1 of (URL + sorted params) using auth token
    const dataToSign = webhookUrl + paramString;
    const expectedSignature = crypto
      .createHmac('sha1', twilioAuthToken)
      .update(dataToSign)
      .digest('base64');

    // 4. Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      // Buffer length mismatch means signatures differ
      logger.warn('admission/sms-webhook', 'Twilio signature validation failed — length mismatch');
      return false;
    }
  }

  return false;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function GET(request: NextRequest) {
  const exotelConfigured = !!process.env.EXOTEL_API_KEY && !!process.env.EXOTEL_API_TOKEN;
  const msg91Configured = !!process.env.MSG91_AUTH_KEY;
  const twilioConfigured = !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_ACCOUNT_SID;

  return NextResponse.json(
    {
      service: 'SMS Delivery Webhook',
      status: 'active',
      endpoint: '/api/webhooks/sms',
      methods: ['POST'],
      providers: {
        exotel: {
          configured: exotelConfigured,
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/sms?provider=exotel`,
        },
        msg91: {
          configured: msg91Configured,
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/sms?provider=msg91`,
        },
        twilio: {
          configured: twilioConfigured,
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/sms?provider=twilio`,
        },
      },
      usage: {
        exotel: 'POST /api/webhooks/sms?provider=exotel',
        msg91: 'POST /api/webhooks/sms?provider=msg91',
        twilio: 'POST /api/webhooks/sms?provider=twilio',
      },
    },
    { status: 200 }
  );
}
