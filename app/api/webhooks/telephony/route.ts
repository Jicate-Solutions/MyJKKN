import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService } from '@/lib/services/telephony/telephony-service';
import type { ExotelCallbackPayload } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { maskPhone } from '@/lib/utils/phone-number';

// ---------------------------------------------------------------------------
// Auth helper — timing-safe comparison to prevent token enumeration attacks
// ---------------------------------------------------------------------------
function verifyToken(providedToken: string): boolean {
  const expectedToken = process.env.EXOTEL_API_TOKEN;
  if (!expectedToken) {
    logger.warn('admissions/telephony-webhook', 'EXOTEL_API_TOKEN env var is not set');
    return false;
  }

  try {
    const a = Buffer.from(providedToken);
    const b = Buffer.from(expectedToken);
    // Buffers must be the same length for timingSafeEqual
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST — receive Exotel call-status webhook
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Verify auth token
  const providedToken =
    request.headers.get('x-exotel-token') ?? request.headers.get('x-api-token') ?? '';

  if (!verifyToken(providedToken)) {
    logger.warn('admissions/telephony-webhook', 'Unauthorized webhook request — invalid token');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse application/x-www-form-urlencoded body
  let payload: ExotelCallbackPayload;
  try {
    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);

    payload = {
      CallSid: params.get('CallSid') ?? undefined,
      Status: params.get('Status') ?? undefined,
      Direction: params.get('Direction') ?? undefined,
      From: params.get('From') ?? undefined,
      To: params.get('To') ?? undefined,
      Duration: params.get('Duration') ?? undefined,
      RecordingUrl: params.get('RecordingUrl') ?? undefined,
      Price: params.get('Price') ?? undefined,
      CustomField: params.get('CustomField') ?? undefined,
      StartTime: params.get('StartTime') ?? undefined,
      EndTime: params.get('EndTime') ?? undefined,
      AnswerTime: params.get('AnswerTime') ?? undefined,
    } as ExotelCallbackPayload;
  } catch (parseError) {
    logger.error('admissions/telephony-webhook', 'Failed to parse webhook body', parseError);
    return NextResponse.json({ error: 'Bad Request — failed to parse body' }, { status: 400 });
  }

  // 3. Validate — need at least one identifier
  if (!payload.CallSid && !payload.CustomField) {
    logger.warn('admissions/telephony-webhook', 'Webhook rejected — missing CallSid and CustomField');
    return NextResponse.json(
      { error: 'Bad Request — CallSid or CustomField is required' },
      { status: 400 }
    );
  }

  // 4. Log receipt with masked phone numbers
  logger.info('admissions/telephony-webhook', 'Exotel call-status webhook received', {
    callSid: payload.CallSid,
    status: payload.Status,
    direction: payload.Direction,
    from: payload.From ? maskPhone(payload.From) : undefined,
    to: payload.To ? maskPhone(payload.To) : undefined,
    customField: payload.CustomField,
  });

  // 5. Respond 200 immediately — Exotel expects a fast response
  const response = NextResponse.json({ received: true, processed: true }, { status: 200 });

  // 6. Background processing via waitUntil (Vercel) or synchronous fallback
  const processCallback = async () => {
    try {
      const supabase = createServiceRoleClient();
      const result = await TelephonyService.handleCallStatusCallback(payload, supabase);

      if (result.processed) {
        logger.info('admissions/telephony-webhook', 'Callback processed successfully', {
          callSid: payload.CallSid,
          reason: result.reason,
        });
      } else {
        logger.info('admissions/telephony-webhook', 'Callback skipped', {
          callSid: payload.CallSid,
          reason: result.reason,
        });
      }
    } catch (processingError) {
      logger.error('admissions/telephony-webhook', 'Callback processing failed', {
        callSid: payload.CallSid,
        error: String(processingError),
      });
    }
  };

  try {
    // Try to use waitUntil for non-blocking background execution on Vercel
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(processCallback());
  } catch {
    // @vercel/functions not available — process synchronously (local dev / non-Vercel)
    await processCallback();
  }

  return response;
}

// ---------------------------------------------------------------------------
// GET — health check
// ---------------------------------------------------------------------------
export async function GET(): Promise<NextResponse> {
  const configured = Boolean(process.env.EXOTEL_API_TOKEN);
  return NextResponse.json({
    status: 'active',
    provider: 'exotel',
    configured,
  });
}
