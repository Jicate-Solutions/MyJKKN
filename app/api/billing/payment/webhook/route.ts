// HDFC Webhook Handler API Endpoint - SECURE VERSION
// POST /api/billing/payment/webhook
// Purpose: Receive and process HDFC payment notifications
// Security: Proper signature verification, no auth bypass
// Created: 2025-01-20 (Security Enhancement)

import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayService } from '@/lib/services/billing/payment-gateway-service';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HDFCWebhookPayload } from '@/types/payment-gateway';


export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    logger.info('billing/payment-webhook', 'Received webhook notification');

    // ============================================================================
    // STEP 1: Verify Basic Authentication (HDFC uses Basic Auth for webhooks)
    // ============================================================================
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      logger.error('billing/payment-webhook', 'Missing or invalid Authorization header');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Missing authentication credentials' },
        { status: 401 }
      );
    }

    // Verify credentials
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

    // ============================================================================
    // STEP 2: Extract Webhook Signature (for payload integrity verification)
    // ============================================================================
    // HDFC may send signature in different headers depending on configuration
    const webhookSignature =
      request.headers.get('x-webhook-signature') ||
      request.headers.get('x-signature') ||
      request.headers.get('x-hdfc-signature') ||
      '';

    logger.info('billing/payment-webhook', 'Signature check', {
      hasSignature: !!webhookSignature,
      signatureLength: webhookSignature?.length || 0,
    });

    // ============================================================================
    // STEP 3: Parse webhook payload
    // ============================================================================
    const payload: HDFCWebhookPayload = await request.json();

    logger.info('billing/payment-webhook', 'Processing webhook event', {
      event_type: payload.event_type,
      event_id: payload.event_id,
      order_id: payload.data?.order?.order_id,
    });

    // ============================================================================
    // STEP 4: Validate signature if provided
    // ============================================================================
    // If signature is required (configurable), validate before processing
    const REQUIRE_SIGNATURE = process.env.HDFC_WEBHOOK_REQUIRE_SIGNATURE === 'true';

    if (REQUIRE_SIGNATURE && !webhookSignature) {
      logger.error('billing/payment-webhook', 'Missing required webhook signature');

      // Log security event
      await PaymentAuditService.logInvalidWebhookSignature(
        payload.data?.order?.order_id || 'unknown',
        { reason: 'Missing signature', event_type: payload.event_type }
      );

      return NextResponse.json(
        { error: 'INVALID_SIGNATURE', message: 'Missing webhook signature' },
        { status: 400 }
      );
    }

    // ============================================================================
    // STEP 5: Process webhook with signature verification
    // ============================================================================
    const result = await PaymentGatewayService.handleWebhook(payload, webhookSignature);

    if (!result.success) {
      logger.error('billing/payment-webhook', 'Webhook processing failed', {
        error: result.error,
      });

      // Check if it was a signature validation failure
      if (result.error === 'Invalid webhook signature') {
        await PaymentAuditService.logInvalidWebhookSignature(
          payload.data?.order?.order_id || 'unknown',
          { reason: 'Signature mismatch', event_type: payload.event_type }
        );
      }

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

    const processingTime = Date.now() - startTime;
    logger.info('billing/payment-webhook', 'Webhook processed successfully', {
      transaction_id: result.transaction_id,
      receipt_created: result.receipt_created,
      processingTimeMs: processingTime,
    });

    // Return success response to HDFC
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
  const webhookConfigured =
    !!process.env.HDFC_WEBHOOK_USERNAME && !!process.env.HDFC_WEBHOOK_PASSWORD;
  const signatureRequired = process.env.HDFC_WEBHOOK_REQUIRE_SIGNATURE === 'true';

  return NextResponse.json(
    {
      service: 'HDFC Payment Gateway Webhook',
      status: 'active',
      endpoint: '/api/billing/payment/webhook',
      methods: ['POST'],
      configuration: {
        authConfigured: webhookConfigured,
        signatureRequired,
      },
    },
    { status: 200 }
  );
}
