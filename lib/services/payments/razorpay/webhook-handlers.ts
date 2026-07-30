// lib/services/payments/razorpay/webhook-handlers.ts
//
// Shared Razorpay webhook dispatch logic, used by BOTH webhook routes:
//   - /api/webhooks/razorpay              (common env account — fallback institutions)
//   - /api/webhooks/razorpay/[webhookRef] (per-institution account)
//
// HMAC verification is done by the ROUTE (it owns which secret to use); this module
// assumes the payload is already verified and only logs + dispatches by event type.
// The dispatch logic is account-agnostic: it routes by razorpay_order_id /
// razorpay_payment_id lookups and notes.module, which uniquely identify the row.

import { createServiceRoleClient } from '@/lib/supabase/server';
import { PaymentAuditService } from '@/lib/services/billing/security/payment-audit-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { PaymentModule } from '../provider';
import {
  WEBHOOK_MODULES,
  WEBHOOK_TRANSACTION_TABLES,
  isPaymentModule,
} from './webhook-module-registry';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Which module a gateway payload belongs to, from the `notes.module` we stamp on
 * every order (see create-order.ts). Untrusted input, so it is validated against
 * the registry rather than compared to a hardcoded list — that way a newly
 * registered module routes without touching this function.
 */
function moduleFromNotes(payment: any, order: any): PaymentModule | undefined {
  const notesModule = payment?.notes?.module ?? order?.notes?.module;
  return isPaymentModule(notesModule) ? notesModule : undefined;
}

/**
 * Idempotency log + dispatch by event type. Errors inside handlers are caught and
 * logged so the route can still return 200 (Razorpay retries on 4xx/5xx).
 */
export async function dispatchRazorpayWebhook(
  supabase: ServiceClient,
  payload: any,
): Promise<void> {
  const eventType: string = payload?.event ?? 'unknown';

  // Idempotency log. Failures here MUST NOT block — a failed insert (e.g. missing
  // columns) would otherwise cause unbounded Razorpay retries.
  try {
    await (supabase as any).from('razorpay_webhook_events').insert({
      provider: 'razorpay',
      event_type: eventType,
      raw_payload: payload,
      received_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('webhook/razorpay', 'razorpay_webhook_events insert failed (non-fatal)', err);
  }

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

  const cfg = WEBHOOK_MODULES[mod];
  const table = cfg.table;

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
  if (cfg.terminalStatuses.includes(existing.status)) {
    logger.info('webhook/razorpay', 'payment.captured: already processed — skipping', {
      id: existing.id,
      status: existing.status,
    });
    return;
  }

  const capturedAt = payment.created_at ? new Date(payment.created_at * 1000).toISOString() : new Date().toISOString();

  const capturedUpdate: Record<string, unknown> = {
    razorpay_payment_id: payment.id,
    status: 'success',
    captured_at: capturedAt,
    gateway_response: payload,
    ...(cfg.capturedExtraColumns?.(payment, capturedAt) ?? {}),
  };

  const { error: capturedUpdateError } = await (supabase as any)
    .from(table)
    .update(capturedUpdate)
    .eq('id', existing.id);
  if (capturedUpdateError) {
    logger.error('webhook/razorpay', 'payment.captured: failed to update transaction row', {
      table,
      id: existing.id,
      error: capturedUpdateError,
    });
  }

  // Downstream: receipt creation (billing), registration mark (events), … —
  // whatever the module declared in the registry.
  await cfg.onCaptured?.(supabase, existing.id, payment, payload);

  await PaymentAuditService.logVerificationSuccess(
    existing.id,
    'unknown', // student_id not always known here; webhook is module-agnostic
    'unknown',
    Number(payment.amount ?? 0) / 100,
    { source: 'razorpay_webhook', event: 'payment.captured', razorpay_payment_id: payment.id },
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
  const table = WEBHOOK_MODULES[mod].table;

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
  const cfg = WEBHOOK_MODULES[mod];
  const table = cfg.table;

  const failedUpdate: Record<string, unknown> = {
    razorpay_payment_id: payment.id,
    status: 'failed',
    gateway_response: payload,
    ...(cfg.failedExtraColumns?.() ?? {}),
  };

  const { error: failedUpdateError } = await (supabase as any)
    .from(table)
    .update(failedUpdate)
    .eq('razorpay_order_id', orderId);
  if (failedUpdateError) {
    logger.error('webhook/razorpay', 'payment.failed: failed to update transaction row', {
      table,
      orderId,
      error: failedUpdateError,
    });
  }
}

async function handleRefundEvent(supabase: ServiceClient, payload: any) {
  const refund = payload?.payload?.refund?.entity;
  if (!refund) return;
  const paymentId = refund.payment_id;
  if (!paymentId) return;

  // A refund payload carries no `module` note, so probe each module's table by
  // razorpay_payment_id. Registry-derived, so a new module is covered without
  // editing this loop; order is the registry's declaration order, i.e. billing
  // first, then events.
  for (const table of WEBHOOK_TRANSACTION_TABLES) {
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
