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

    // Step 1: Verify Basic Authentication (HDFC uses Basic Auth for webhooks)
    // TEMPORARILY DISABLED FOR TESTING - RE-ENABLE IN PRODUCTION
    const authHeader = request.headers.get('authorization');

    // Skip auth check for testing (comment out for production)
    const SKIP_AUTH_FOR_TESTING = process.env.HDFC_WEBHOOK_SKIP_AUTH === 'true';

    if (!SKIP_AUTH_FOR_TESTING) {
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        logger.error('billing/payment-webhook', 'Missing or invalid Authorization header');
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Missing authentication credentials' },
          { status: 401 }
        );
      }

      // Step 2: Verify credentials
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      const WEBHOOK_USERNAME = process.env.HDFC_WEBHOOK_USERNAME || '';
      const WEBHOOK_PASSWORD = process.env.HDFC_WEBHOOK_PASSWORD || '';

      if (!WEBHOOK_USERNAME || !WEBHOOK_PASSWORD) {
        logger.error('billing/payment-webhook', 'Webhook credentials not configured in environment');
        return NextResponse.json(
          { error: 'CONFIGURATION_ERROR', message: 'Webhook authentication not configured' },
          { status: 500 }
        );
      }

      if (username !== WEBHOOK_USERNAME || password !== WEBHOOK_PASSWORD) {
        logger.error('billing/payment-webhook', 'Invalid webhook credentials', { username });
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Invalid credentials' },
          { status: 401 }
        );
      }

      logger.info('billing/payment-webhook', 'Webhook authentication successful');
    } else {
      logger.warn('billing/payment-webhook', '⚠️ Auth check SKIPPED - FOR TESTING ONLY');
    }

    // Step 3: Parse webhook payload
    const payload: HDFCWebhookPayload = await request.json();

    logger.info('billing/payment-webhook', 'Processing webhook event', {
      event_type: payload.event_type,
      event_id: payload.event_id,
      order_id: payload.data?.order?.order_id,
    });

    // Step 4: Process webhook (pass empty signature since HDFC uses Basic Auth)
    const result = await PaymentGatewayService.handleWebhook(payload, '');

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
