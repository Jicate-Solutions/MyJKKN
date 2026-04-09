export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/payment/webhook
// HDFC server-to-server webhook notification.
// Verifies Basic Auth before processing.

import { NextRequest, NextResponse } from 'next/server';
import { HDFCEventClient } from '@/lib/services/events/core/hdfc-event-client';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Step 1: Verify Basic Auth
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Basic ')) {
      logger.warn('events/payment-webhook', 'Missing Basic Auth header', { eventId });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base64Credentials = authHeader.slice(6);
    let username = '';
    let password = '';
    try {
      const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      username = decoded.substring(0, colonIndex);
      password = decoded.substring(colonIndex + 1);
    } catch {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!HDFCEventClient.verifyWebhookAuth(username, password)) {
      logger.error('events/payment-webhook', 'Invalid webhook credentials', { eventId });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Parse webhook payload
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    logger.info('events/payment-webhook', 'Webhook received', {
      eventId,
      eventType: payload?.event_type,
      orderId: payload?.data?.order?.order_id,
    });

    // Step 3: Process webhook
    await EventPaymentService.handleWebhook(payload);

    // Always return 200 to acknowledge receipt (prevent HDFC retries)
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    logger.error('events/payment-webhook', 'Webhook processing error', error);

    // Still return 200 to prevent HDFC from retrying endlessly
    // The error is logged for investigation
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }
}
