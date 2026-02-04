// app/api/webhooks/sms/route.ts
// SMS Delivery Webhook Handler - MSG91 & Twilio Support
// POST /api/webhooks/sms?provider=msg91|twilio

import { NextRequest, NextResponse } from 'next/server';
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
    const provider = (request.nextUrl.searchParams.get('provider') || 'msg91') as SMSProvider;

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
      messageId: provider === 'msg91' ? payload.data?.requestId : payload.MessageSid,
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
 * Verify webhook authentication based on provider
 */
async function verifyWebhookAuth(request: NextRequest, provider: SMSProvider): Promise<boolean> {
  if (provider === 'msg91') {
    // MSG91 uses IP whitelist or auth key in header
    const authKey = request.headers.get('authkey') || request.headers.get('x-authkey');
    const expectedKey = process.env.MSG91_WEBHOOK_AUTH_KEY;

    // If no webhook auth key configured, allow (for testing)
    if (!expectedKey) {
      logger.warn('admission/sms-webhook', 'MSG91 webhook auth key not configured');
      return true;
    }

    return authKey === expectedKey;
  }

  if (provider === 'twilio') {
    // Twilio uses signature validation
    const signature = request.headers.get('x-twilio-signature');
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    // If no auth token configured, allow (for testing)
    if (!twilioAuthToken) {
      logger.warn('admission/sms-webhook', 'Twilio auth token not configured');
      return true;
    }

    // In production, implement proper Twilio signature validation
    // See: https://www.twilio.com/docs/usage/security#validating-requests
    // For now, just check if signature is present
    if (!signature) {
      return false;
    }

    // TODO: Implement proper Twilio signature validation
    // const crypto = require('crypto');
    // const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/sms?provider=twilio`;
    // const params = await request.formData();
    // ... validate signature
    return true;
  }

  return false;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function GET(request: NextRequest) {
  const msg91Configured = !!process.env.MSG91_AUTH_KEY;
  const twilioConfigured = !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_ACCOUNT_SID;

  return NextResponse.json(
    {
      service: 'SMS Delivery Webhook',
      status: 'active',
      endpoint: '/api/webhooks/sms',
      methods: ['POST'],
      providers: {
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
        msg91: 'POST /api/webhooks/sms?provider=msg91',
        twilio: 'POST /api/webhooks/sms?provider=twilio',
      },
    },
    { status: 200 }
  );
}
