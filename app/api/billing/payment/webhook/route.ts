// HDFC Webhook Handler API Endpoint
// POST /api/billing/payment/webhook
// Purpose: Receive and process HDFC payment notifications

import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HDFCWebhookPayload } from '@/types/payment-gateway';

export async function POST(request: NextRequest) {
  try {
    logger.info('billing/payment-webhook', 'Received webhook notification');

    // Step 1: Extract webhook signature from headers
    const signature = request.headers.get('x-hdfc-signature') || request.headers.get('x-webhook-signature') || '';

    if (!signature) {
      logger.warn('billing/payment-webhook', 'Missing webhook signature');
      return NextResponse.json(
        { error: 'MISSING_SIGNATURE', message: 'Webhook signature is required' },
        { status: 400 }
      );
    }

    // Step 2: Parse webhook payload
    const payload: HDFCWebhookPayload = await request.json();

    logger.info('billing/payment-webhook', 'Processing webhook event', {
      event_type: payload.event_type,
      event_id: payload.event_id,
      order_id: payload.data?.order?.order_id,
    });

    // Step 3: Process webhook
    const result = await PaymentGatewayService.handleWebhook(payload, signature);

    if (!result.success) {
      logger.error('billing/payment-webhook', 'Webhook processing failed', {
        error: result.error,
      });

      // Return 200 to HDFC to acknowledge receipt, even if processing failed
      // This prevents HDFC from retrying indefinitely
      return NextResponse.json(
        {
          received: true,
          processed: false,
          error: result.error,
        },
        { status: 200 }
      );
    }

    logger.info('billing/payment-webhook', 'Webhook processed successfully', {
      transaction_id: result.transaction_id,
      receipt_created: result.receipt_created,
    });

    // Step 4: Return success response to HDFC
    return NextResponse.json(
      {
        received: true,
        processed: true,
        transaction_id: result.transaction_id,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('billing/payment-webhook', 'Webhook endpoint error', error);

    // Return 200 to HDFC to prevent retries
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

// Health check endpoint for webhook configuration
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      service: 'HDFC Payment Gateway Webhook',
      status: 'active',
      endpoint: '/api/billing/payment/webhook',
      methods: ['POST'],
    },
    { status: 200 }
  );
}
