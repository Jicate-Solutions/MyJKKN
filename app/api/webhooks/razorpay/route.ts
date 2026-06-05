export const dynamic = 'force-dynamic';

// Razorpay webhook — COMMON (env) account.
// POST /api/webhooks/razorpay
//
// Used by institutions that have NOT been migrated to their own Razorpay account
// (they settle through the common env account). Verifies the X-Razorpay-Signature
// header with the env webhook secret, then dispatches via the shared handler.
//
// Per-institution accounts use /api/webhooks/razorpay/[webhookRef] instead.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyWebhookSignature } from '@/lib/services/payments/razorpay/verify-webhook';
import { dispatchRazorpayWebhook } from '@/lib/services/payments/razorpay/webhook-handlers';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-razorpay-signature') ?? '';

  // Verify against the COMMON (env) webhook secret. Fail fast (500) if it isn't
  // configured rather than passing '' down — the verifier would reject anyway, but
  // an explicit misconfiguration signal is clearer for ops and robust against any
  // future refactor of verifyWebhookSignature's empty-secret guard.
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('webhook/razorpay', 'RAZORPAY_WEBHOOK_SECRET is not configured — cannot verify common-account webhook');
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }
  if (!verifyWebhookSignature({ rawBody, signatureHeader }, webhookSecret)) {
    logger.warn('webhook/razorpay', 'Invalid webhook signature received (common account)');
    await PaymentAuditService.logInvalidWebhookSignature('unknown', {
      source: 'razorpay_webhook',
      account: 'env',
      bodyLength: rawBody.length,
    });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    logger.error('webhook/razorpay', 'Failed to parse webhook body', err);
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    await dispatchRazorpayWebhook(createServiceRoleClient(), payload);
  } catch (err) {
    logger.error('webhook/razorpay', 'Handler threw — returning 200 to avoid retry storm', {
      eventType: payload?.event,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}
