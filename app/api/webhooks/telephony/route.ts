// app/api/webhooks/telephony/route.ts
// Exotel Call Status Callback Handler
// POST /api/webhooks/telephony

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  TelephonyService,
  type ExotelCallbackPayload,
} from '@/lib/services/telephony/telephony-service';

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    logger.info('telephony/webhook', 'Received Exotel callback');

    // ========================================================================
    // STEP 1: Verify Authentication
    // ========================================================================
    const isAuthenticated = verifyWebhookAuth(request);

    if (!isAuthenticated) {
      logger.error('telephony/webhook', 'Webhook authentication failed');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Invalid webhook authentication' },
        { status: 401 }
      );
    }

    // ========================================================================
    // STEP 2: Parse Callback Payload
    // ========================================================================
    let payload: ExotelCallbackPayload;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Exotel sends as form-encoded data
      const formData = await request.formData();
      const data: Record<string, string> = {};
      formData.forEach((value, key) => {
        data[key] = value.toString();
      });
      payload = data as ExotelCallbackPayload;
    } else {
      // JSON fallback
      payload = await request.json();
    }

    logger.info('telephony/webhook', 'Processing callback', {
      callSid: payload.CallSid,
      status: payload.Status,
      direction: payload.Direction,
    });

    // ========================================================================
    // STEP 3: Process Callback
    // ========================================================================
    const result = await TelephonyService.handleCallStatusCallback(payload);

    const processingTime = Date.now() - startTime;

    if (!result.success) {
      logger.error('telephony/webhook', 'Callback processing failed', {
        error: result.error,
        processingTimeMs: processingTime,
      });

      // Return 200 to acknowledge receipt even if processing failed
      // This prevents Exotel from retrying indefinitely
      return NextResponse.json(
        {
          received: true,
          processed: false,
          error: result.error,
        },
        { status: 200 }
      );
    }

    logger.info('telephony/webhook', 'Callback processed successfully', {
      callSid: payload.CallSid,
      status: payload.Status,
      processingTimeMs: processingTime,
    });

    return NextResponse.json(
      {
        received: true,
        processed: true,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('telephony/webhook', 'Webhook endpoint error', error);

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
 * Verify Exotel webhook authentication.
 * Exotel sends an API token that should match our configured token.
 */
function verifyWebhookAuth(request: NextRequest): boolean {
  const expectedToken = process.env.EXOTEL_API_TOKEN;

  // If no webhook auth configured, allow (for testing/development)
  if (!expectedToken) {
    logger.warn('telephony/webhook', 'EXOTEL_API_TOKEN not configured — allowing unauthenticated webhook');
    return true;
  }

  // Check for token in various common header formats
  const authHeader = request.headers.get('authorization');
  const apiToken = request.headers.get('x-exotel-token') || request.headers.get('x-api-token');

  if (apiToken && apiToken === expectedToken) {
    return true;
  }

  // Check Basic auth header (Exotel sometimes uses basic auth in callbacks)
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6));
      const [, token] = decoded.split(':');
      if (token === expectedToken) {
        return true;
      }
    } catch {
      // Invalid base64
    }
  }

  // Check query parameter as a fallback
  const tokenParam = request.nextUrl.searchParams.get('token');
  if (tokenParam && tokenParam === expectedToken) {
    return true;
  }

  return false;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function GET() {
  const configured = TelephonyService.isConfigured();

  return NextResponse.json(
    {
      service: 'Exotel Telephony Webhook',
      status: configured ? 'active' : 'not_configured',
      endpoint: '/api/webhooks/telephony',
      methods: ['POST'],
      provider: 'exotel',
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/telephony`,
    },
    { status: 200 }
  );
}
