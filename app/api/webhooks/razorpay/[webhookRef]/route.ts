export const dynamic = 'force-dynamic';

// Razorpay webhook — PER-INSTITUTION account.
// POST /api/webhooks/razorpay/[webhookRef]
//
// Each institution's Razorpay account is configured (in its own Razorpay dashboard)
// with this URL, where <webhookRef> is the opaque token generated for that account.
// The ref resolves the account's webhook secret (ignoring is_active, so in-flight
// payments on a rotated-out account still verify), we verify the HMAC with it, then
// dispatch via the shared handler (identical downstream logic to the common route).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyWebhookSignature } from '@/lib/services/payments/razorpay/verify-webhook';
import { dispatchRazorpayWebhook } from '@/lib/services/payments/razorpay/webhook-handlers';
import { RazorpayAccountVault } from '@/lib/services/payments/razorpay/account-vault';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookRef: string }> },
) {
  const { webhookRef } = await params;
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-razorpay-signature') ?? '';

  // Resolve the account by its webhook ref (deactivated accounts still resolve so
  // their in-flight payments verify).
  let account: { accountId: string; institutionId: string; webhookSecret: string } | null = null;
  try {
    account = await RazorpayAccountVault.getByWebhookRef(webhookRef);
  } catch (err) {
    logger.error('webhook/razorpay', 'Failed to resolve account by webhook ref', {
      webhookRef,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'resolution_failed' }, { status: 500 });
  }

  if (!account) {
    logger.warn('webhook/razorpay', 'Unknown webhook ref', { webhookRef });
    await PaymentAuditService.logInvalidWebhookSignature('unknown', {
      source: 'razorpay_webhook',
      reason: 'unknown_webhook_ref',
      webhookRef,
    });
    return NextResponse.json({ error: 'unknown_webhook_ref' }, { status: 404 });
  }

  if (!verifyWebhookSignature({ rawBody, signatureHeader }, account.webhookSecret)) {
    logger.warn('webhook/razorpay', 'Invalid webhook signature (per-institution account)', {
      institutionId: account.institutionId,
    });
    await PaymentAuditService.logInvalidWebhookSignature('unknown', {
      source: 'razorpay_webhook',
      account: account.accountId,
      institutionId: account.institutionId,
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
      institutionId: account.institutionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}
