// app/api/webhooks/telephony/route.ts
// Exotel Call Status Callback Handler
// POST /api/webhooks/telephony

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
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
    //
    // Exotel delivers call events via two distinct paths, each using a
    // different payload convention. We MUST handle both.
    //
    //   1. StatusCallback (DID-level, configured on each ExoPhone):
    //        POST with form-encoded body, fields named `From`, `To`, `Status`
    //   2. Passthru (in-flow applet dropped into an ExoML flow):
    //        POST with EMPTY body; metadata appended to the URL as query
    //        params, fields named `CallFrom`, `CallTo`, `CallStatus`
    //
    // Previously this handler only read the body + only recognised the
    // StatusCallback naming — which meant every in-flow Passthru delivery
    // (the 16 async passthrus set up 2026-04-22/23) was ACK'd with HTTP 200
    // but silently dropped because the payload came out empty and CallSid
    // was missing.
    //
    // Fix: merge URL query params with body params (body wins on conflict)
    // and normalise the Passthru `CallX` names into the StatusCallback `X`
    // names so downstream code keeps working unchanged.
    // ========================================================================
    const contentType = request.headers.get('content-type') || '';
    const data: Record<string, string> = {};

    // 2a. Start with URL query params (Exotel Passthru puts metadata here).
    //     Skip the `token` auth param — it's for verifyWebhookAuth, not payload.
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== 'token') data[key] = value;
    });

    // 2b. Overlay body params (Exotel StatusCallback puts metadata here).
    //     Body wins on conflict — StatusCallback values are more authoritative.
    if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          data[key] = value.toString();
        });
      } catch {
        // Empty or malformed body is fine — we already have query params.
      }
    } else if (contentType.includes('application/json')) {
      try {
        const json = await request.json();
        if (json && typeof json === 'object') {
          for (const [k, v] of Object.entries(json)) data[k] = String(v);
        }
      } catch {
        // Empty or malformed body is fine — we already have query params.
      }
    }

    // 2c. Normalise Passthru field names (`CallFrom`, `CallTo`, `CallStatus`)
    //     to StatusCallback names so the rest of the code is oblivious.
    if (data.CallFrom && !data.From) data.From = data.CallFrom;
    if (data.CallTo && !data.To) data.To = data.CallTo;
    if (data.CallStatus && !data.Status) data.Status = data.CallStatus;

    const payload = data as ExotelCallbackPayload;

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
 * SECURITY: Rejects requests when EXOTEL_API_TOKEN is not configured.
 */
function verifyWebhookAuth(request: NextRequest): boolean {
  const expectedToken = process.env.EXOTEL_API_TOKEN;

  // SECURITY: Reject if token is not configured — never allow unauthenticated requests
  if (!expectedToken) {
    logger.error('telephony/webhook', 'EXOTEL_API_TOKEN not configured — rejecting request');
    return false;
  }

  // Check for token in various common header formats
  const authHeader = request.headers.get('authorization');
  const apiToken = request.headers.get('x-exotel-token') || request.headers.get('x-api-token');

  if (apiToken && apiToken.length === expectedToken.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(apiToken), Buffer.from(expectedToken))) {
        return true;
      }
    } catch {
      // Length mismatch handled by try/catch
    }
  }

  // Check Basic auth header (Exotel sometimes uses basic auth in callbacks)
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6));
      const [, token] = decoded.split(':');
      if (token && token.length === expectedToken.length) {
        if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
          return true;
        }
      }
    } catch {
      // Invalid base64 or length mismatch
    }
  }

  // Check query parameter as a fallback
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

  logger.warn('telephony/webhook', 'Exotel webhook authentication failed — no valid token found');
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
