export const dynamic = 'force-dynamic';

// Razorpay Unified Webhook Endpoint
// POST /api/webhooks/razorpay
// Verifies HMAC signature, idempotently logs the event, then dispatches by event type
// for both billing and events modules (Module is inferred from notes.module on
// the Razorpay order/payment entity, set at order creation time).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-razorpay-signature') ?? '';

  // Step 1: HMAC verification (billing provider's WEBHOOK secret; same secret
  // is used for events since Razorpay only allows one webhook secret per account).
  const provider = getPaymentProvider('billing');
  if (!provider.verifyWebhookSignature({ rawBody, signatureHeader })) {
    logger.warn('webhook/razorpay', 'Invalid webhook signature received');
    await PaymentAuditService.logInvalidWebhookSignature('unknown', {
      source: 'razorpay_webhook',
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

  const eventType: string = payload?.event ?? 'unknown';
  const supabase = createServiceRoleClient();

  // Step 2: Idempotency log. Failures here MUST NOT block the webhook — Razorpay
  // retries 4xx/5xx responses, and a failed insert (e.g. missing columns) would
  // cause unbounded retries.
  try {
    await (supabase as any).from('webhook_logs').insert({
      provider: 'razorpay',
      event_type: eventType,
      raw_payload: payload,
      received_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('webhook/razorpay', 'webhook_logs insert failed (non-fatal)', err);
  }

  // Step 3: Dispatch by event type
  try {
    switch (eventType) {
      case 'order.paid':
      case 'payment.captured':
        await handlePaymentCaptured(supabase, payload);
        break;
      case 'payment.authorized':
        await handlePaymentAuthorized(supabase, payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(supabase, payload);
        break;
      case 'refund.created':
      case 'refund.processed':
      case 'refund.failed':
        await handleRefundEvent(supabase, payload);
        break;
      case 'payment.dispute.created':
      case 'payment.dispute.lost':
      case 'payment.dispute.won':
      case 'payment.dispute.closed':
        await handleDisputeEvent(supabase, payload);
        break;
      default:
        logger.info('webhook/razorpay', 'Unhandled event type', { eventType });
        break;
    }
  } catch (err) {
    logger.error('webhook/razorpay', 'Handler threw — webhook will return 200 to avoid retry storm', {
      eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}

function moduleFromNotes(payment: any, order: any): 'billing' | 'events' | undefined {
  const notesModule = payment?.notes?.module ?? order?.notes?.module;
  if (notesModule === 'billing' || notesModule === 'events') return notesModule;
  return undefined;
}

async function handlePaymentCaptured(supabase: ServiceClient, payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const order = payload?.payload?.order?.entity;
  if (!payment) return;

  const orderId: string | undefined = payment.order_id;
  if (!orderId) return;

  const mod = moduleFromNotes(payment, order);
  if (!mod) {
    logger.warn('webhook/razorpay', 'payment.captured: module note missing — cannot route', { orderId });
    return;
  }

  const table = mod === 'billing' ? 'payment_transactions' : 'event_payment_transactions';

  const { data: existing } = await (supabase as any)
    .from(table)
    .select('id, status')
    .eq('razorpay_order_id', orderId)
    .single();
  if (!existing) {
    logger.warn('webhook/razorpay', 'payment.captured: order not found', { table, orderId });
    return;
  }

  // Anti-replay: skip if already terminal
  if (existing.status === 'success' || existing.status === 'refunded') {
    logger.info('webhook/razorpay', 'payment.captured: already processed — skipping', {
      id: existing.id,
      status: existing.status,
    });
    return;
  }

  const capturedAt = payment.created_at ? new Date(payment.created_at * 1000).toISOString() : new Date().toISOString();

  await (supabase as any).from(table).update({
    razorpay_payment_id: payment.id,
    status: 'success',
    captured_at: capturedAt,
    payment_date: capturedAt,
    completed_at: new Date().toISOString(),
    gateway_response: payload,
  }).eq('id', existing.id);

  // Downstream: receipt creation (billing) or registration mark (events)
  if (mod === 'billing') {
    const { PaymentGatewayService } = await import('@/lib/services/billing/payment-gateway-service');
    // Re-fetch the transaction in PaymentGatewayService's expected shape and process it
    const { data: txn } = await (supabase as any)
      .from('payment_transactions')
      .select('*')
      .eq('id', existing.id)
      .single();
    if (txn) {
      await (PaymentGatewayService as any).processSuccessfulPayment?.(txn);
    }
  }
  // For events: leaving registration-mark logic to Phase 5 EventPaymentService update.

  await PaymentAuditService.logVerificationSuccess(
    existing.id,
    'unknown', // student_id not always known here; webhook is module-agnostic
    'unknown',
    Number(payment.amount ?? 0) / 100,
    { source: 'razorpay_webhook', event: 'payment.captured', razorpay_payment_id: payment.id }
  );
}

async function handlePaymentAuthorized(supabase: ServiceClient, payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const order = payload?.payload?.order?.entity;
  if (!payment) return;
  const orderId: string | undefined = payment.order_id;
  if (!orderId) return;

  const mod = moduleFromNotes(payment, order);
  if (!mod) return;
  const table = mod === 'billing' ? 'payment_transactions' : 'event_payment_transactions';

  // Authorized but not yet captured. We auto-capture via payment_capture=1 so this is
  // usually transient — log it but do not finalize status.
  await (supabase as any).from(table).update({
    razorpay_payment_id: payment.id,
    status: 'processing',
    gateway_response: payload,
  }).eq('razorpay_order_id', orderId);
}

async function handlePaymentFailed(supabase: ServiceClient, payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const order = payload?.payload?.order?.entity;
  if (!payment) return;
  const orderId: string | undefined = payment.order_id;
  if (!orderId) return;

  const mod = moduleFromNotes(payment, order);
  if (!mod) return;
  const table = mod === 'billing' ? 'payment_transactions' : 'event_payment_transactions';

  await (supabase as any).from(table).update({
    razorpay_payment_id: payment.id,
    status: 'failed',
    gateway_response: payload,
    completed_at: new Date().toISOString(),
  }).eq('razorpay_order_id', orderId);
}

async function handleRefundEvent(supabase: ServiceClient, payload: any) {
  const refund = payload?.payload?.refund?.entity;
  if (!refund) return;
  const paymentId = refund.payment_id;
  if (!paymentId) return;

  // Try billing first, then events (we don't always have a `module` note on refunds)
  for (const table of ['payment_transactions', 'event_payment_transactions'] as const) {
    const { data: existing } = await (supabase as any)
      .from(table)
      .select('id, status')
      .eq('razorpay_payment_id', paymentId)
      .single();
    if (!existing) continue;

    const refundStatus =
      refund.status === 'processed' ? 'refunded' :
      refund.status === 'failed' ? 'failed' :
      'processing';

    await (supabase as any).from(table).update({
      status: refundStatus === 'refunded' ? 'refunded' : existing.status,
      refund_status: refund.status,
      gateway_response: payload,
    }).eq('id', existing.id);
    return;
  }
}

async function handleDisputeEvent(supabase: ServiceClient, payload: any) {
  const dispute = payload?.payload?.payment?.entity ?? payload?.payload?.dispute?.entity;
  const paymentId = dispute?.id ?? payload?.payload?.payment?.entity?.id;
  if (!paymentId) return;

  // Insert/update payment_disputes row (table created in Phase 1 migration).
  try {
    await (supabase as any).from('payment_disputes').upsert({
      gateway_payment_id: paymentId,
      provider: 'razorpay',
      status: payload?.event ?? 'unknown',
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'gateway_payment_id' });
  } catch (err) {
    logger.warn('webhook/razorpay', 'payment_disputes upsert failed (non-fatal)', err);
  }
}
