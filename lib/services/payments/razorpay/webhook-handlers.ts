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
function moduleFromNotes(payment: any, order: any, qrCode?: any): PaymentModule | undefined {
  // On a qr_code.credited payload the notes live on the QR entity — the payment
  // entity's notes may be empty — so that is a third place to look.
  const notesModule = payment?.notes?.module ?? order?.notes?.module ?? qrCode?.notes?.module;
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
    case 'qr_code.credited':
      await handleQrCodeCredited(supabase, payload);
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

  // Order-less modules (QR collection) have no such column — querying it would be
  // meaningless. Their credit arrives as qr_code.credited instead.
  if (!cfg.orderIdColumn) return;

  // Pull the expected amount too when the module opts into amount checking, so the
  // comparison below has something to compare against.
  const selectCols = cfg.amountPaiseColumn
    ? `id, status, ${cfg.amountPaiseColumn}`
    : 'id, status';

  const { data: existing } = await (supabase as any)
    .from(table)
    .select(selectCols)
    .eq(cfg.orderIdColumn, orderId)
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

  // ── Amount check ────────────────────────────────────────────────────────────
  // Only for modules that declared an expected-amount column. A signature and a
  // capture event prove money moved; they do not prove the RIGHT amount moved.
  // On a mismatch we record it and run NO downstream side-effect — no receipt, no
  // sale — because both alternatives (charging the wrong amount, or handing over
  // goods unpaid for) are worse than making a human look at it.
  if (cfg.amountPaiseColumn && cfg.statuses.mismatch) {
    const expectedPaise = Number((existing as any)[cfg.amountPaiseColumn] ?? 0);
    const capturedPaise = Number(payment.amount ?? 0);

    if (expectedPaise > 0 && capturedPaise !== expectedPaise) {
      await (supabase as any).from(table).update({
        status: cfg.statuses.mismatch,
        razorpay_payment_id: payment.id,
        gateway_response: payload,
        updated_at: new Date().toISOString(),
        ...(cfg.capturedExtraColumns?.(payment, capturedAt) ?? {}),
      }).eq('id', existing.id);

      logger.error('webhook/razorpay', 'payment.captured: captured amount does not match', {
        table, id: existing.id, expectedPaise, capturedPaise,
      });
      await PaymentAuditService.logAmountMismatch(
        existing.id,
        'unknown',
        'unknown',
        expectedPaise / 100,
        capturedPaise / 100,
        undefined,
        { source: 'razorpay_webhook', event: 'payment.captured', razorpay_payment_id: payment.id },
      );
      return;
    }
  }

  const capturedUpdate: Record<string, unknown> = {
    razorpay_payment_id: payment.id,
    status: cfg.statuses.captured,
    ...(cfg.capturedAtColumn ? { [cfg.capturedAtColumn]: capturedAt } : {}),
    gateway_response: payload,
    ...(cfg.capturedExtraColumns?.(payment, capturedAt) ?? {}),
  };

  // Atomic claim. Razorpay fires BOTH order.paid and payment.captured for one
  // capture, and each arrives as its own serverless invocation — the
  // read-then-act terminal check above cannot arbitrate between them (both
  // read a pre-terminal status; incident 2026-08-27: pay_TUh0Qpmo3jktV8 was
  // receipted twice this way, 2.6ms apart). The status predicate makes this
  // UPDATE the arbiter: exactly one invocation flips the row to a terminal
  // status and runs the downstream side-effect; the loser matches zero rows
  // and stops here.
  const { data: claimed, error: capturedUpdateError } = await (supabase as any)
    .from(table)
    .update(capturedUpdate)
    .eq('id', existing.id)
    .not('status', 'in', `(${cfg.terminalStatuses.join(',')})`)
    .select('id');
  if (capturedUpdateError) {
    logger.error('webhook/razorpay', 'payment.captured: failed to update transaction row', {
      table,
      id: existing.id,
      error: capturedUpdateError,
    });
    // Without a successful claim we must NOT run the downstream side-effect —
    // a receipt without the status flip recreates the duplicate-receipt race.
    // Razorpay's retry (or the callback / late-auth cron) will finalize.
    return;
  }
  if (!claimed || claimed.length === 0) {
    logger.info('webhook/razorpay', 'payment.captured: lost finalize race — row already terminal', {
      table,
      id: existing.id,
    });
    return;
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

/**
 * A QR was paid.
 *
 * Differs from payment.captured in three ways that matter:
 *   - the payment entity carries NO order_id, so the row is found by qr_code id;
 *   - the module note lives on the QR entity, not necessarily on the payment;
 *   - this handler records the money and stops. It does NOT book the sale.
 *
 * That last point is deliberate. Booking a sale runs ims_pos_checkout, which
 * derives the cashier from auth.uid() — and a webhook has no session. Rather than
 * weaken that guard with a service-role actor override, the cashier's own polling
 * request books the sale, because that request DOES carry a session. The webhook's
 * only job is to make "the money arrived" a fact the poll can act on.
 */
async function handleQrCodeCredited(supabase: ServiceClient, payload: any) {
  const qr = payload?.payload?.qr_code?.entity;
  const payment = payload?.payload?.payment?.entity;
  if (!qr || !payment) return;

  const mod = moduleFromNotes(payment, null, qr);
  if (!mod) {
    logger.warn('webhook/razorpay', 'qr_code.credited: module note missing — cannot route', { qrId: qr.id });
    return;
  }

  const cfg = WEBHOOK_MODULES[mod];
  if (!cfg.qrCodeIdColumn) {
    logger.warn('webhook/razorpay', 'qr_code.credited: module does not collect by QR', { mod });
    return;
  }

  // Prefer our own id from the notes: it survives the window where Razorpay
  // accepted the QR but our follow-up write of razorpay_qr_code_id failed.
  const ownId: string | undefined = qr?.notes?.gateway_payment_id;
  let query = (supabase as any).from(cfg.table).select('id, status, amount_paise');
  query = ownId ? query.eq('id', ownId) : query.eq(cfg.qrCodeIdColumn, qr.id);

  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    logger.warn('webhook/razorpay', 'qr_code.credited: payment row not found', {
      table: cfg.table, qrId: qr.id, ownId,
    });
    return;
  }

  // Anti-replay — Razorpay retries, and a second credit must not overwrite a
  // resolved amount_mismatch.
  if (cfg.terminalStatuses.includes(existing.status)) {
    logger.info('webhook/razorpay', 'qr_code.credited: already terminal — skipping', {
      id: existing.id, status: existing.status,
    });
    return;
  }

  const capturedPaise = Number(payment.amount ?? 0);

  // The amount actually captured must match the bill. On a mismatch we record the
  // discrepancy and book NOTHING — a human decides, because the alternatives are
  // charging the customer the wrong amount or handing over goods unpaid for.
  if (capturedPaise !== Number(existing.amount_paise)) {
    await (supabase as any).from(cfg.table).update({
      status: 'amount_mismatch',
      razorpay_payment_id: payment.id,
      captured_amount_paise: capturedPaise,
      gateway_response: payload,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);

    logger.error('webhook/razorpay', 'qr_code.credited: captured amount does not match the bill', {
      id: existing.id, expectedPaise: existing.amount_paise, capturedPaise,
    });
    await PaymentAuditService.logAmountMismatch(
      existing.id,
      'unknown', // no learner on a counter sale
      'unknown',
      Number(existing.amount_paise) / 100,
      capturedPaise / 100,
      undefined,
      { source: 'razorpay_webhook', event: 'qr_code.credited', razorpay_payment_id: payment.id },
    );
    return;
  }

  // Honour a late credit. Razorpay's close_by is authoritative over our own expiry:
  // if the money arrived, we received it, and refusing it would leave a customer who
  // has paid facing a counter that says otherwise.
  const isLate = existing.status === 'expired';

  const { error: updErr } = await (supabase as any).from(cfg.table).update({
    status: 'paid',
    razorpay_payment_id: payment.id,
    captured_amount_paise: capturedPaise,
    paid_at: payment.created_at
      ? new Date(payment.created_at * 1000).toISOString()
      : new Date().toISOString(),
    late_credit: isLate,
    gateway_response: payload,
    updated_at: new Date().toISOString(),
  }).eq('id', existing.id);

  if (updErr) {
    logger.error('webhook/razorpay', 'qr_code.credited: failed to mark paid', {
      id: existing.id, error: updErr,
    });
    return;
  }

  await PaymentAuditService.logVerificationSuccess(
    existing.id, 'unknown', 'unknown', capturedPaise / 100,
    { source: 'razorpay_webhook', event: 'qr_code.credited', razorpay_payment_id: payment.id },
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
  const cfgA = WEBHOOK_MODULES[mod];
  if (!cfgA.orderIdColumn) return;   // order-less module (QR) — nothing to update
  // A module whose table has no intermediate state declares no `authorized` word.
  // Writing one anyway would be rejected by its CHECK constraint, and for a moment
  // nobody observes — auto-capture follows immediately.
  if (!cfgA.statuses.authorized) return;
  const table = cfgA.table;

  // Authorized but not yet captured. We auto-capture via payment_capture=1 so this is
  // usually transient — log it but do not finalize status.
  //
  // Never regress a terminal row: payment.authorized can arrive AFTER
  // payment.captured (2026-08-27: it landed 31ms behind and knocked a
  // 'success' transaction back to 'processing'). The predicate keeps this
  // write a no-op once the row is finalized.
  const { error: authorizedUpdateError } = await (supabase as any).from(table).update({
    razorpay_payment_id: payment.id,
    status: cfgA.statuses.authorized,
    gateway_response: payload,
  }).eq(cfgA.orderIdColumn, orderId)
    .not('status', 'in', `(${cfgA.terminalStatuses.join(',')})`);
  if (authorizedUpdateError) {
    logger.error('webhook/razorpay', 'payment.authorized: failed to update transaction row', {
      table,
      orderId,
      error: authorizedUpdateError,
    });
  }
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
  if (!cfg.orderIdColumn) return;   // order-less module (QR) — nothing to update
  const table = cfg.table;

  // Razorpay allows several payment attempts against ONE order, so a failure event
  // for an abandoned first attempt can arrive after the retry succeeded. Modules
  // that opt in refuse to write over a row that is already terminal — for a counter
  // sale the alternative is a customer who paid, a row that says failed, and no sale.
  if (cfg.guardTerminalOnFailure) {
    const { data: current } = await (supabase as any)
      .from(table)
      .select('id, status')
      .eq(cfg.orderIdColumn, orderId)
      .maybeSingle();

    if (!current) {
      logger.warn('webhook/razorpay', 'payment.failed: order not found', { table, orderId });
      return;
    }
    if (cfg.terminalStatuses.includes(current.status)) {
      logger.info('webhook/razorpay', 'payment.failed: row already terminal — not overwriting', {
        table, id: current.id, status: current.status,
      });
      return;
    }
  }

  const failedUpdate: Record<string, unknown> = {
    razorpay_payment_id: payment.id,
    status: cfg.statuses.failed,
    gateway_response: payload,
    ...(cfg.failedExtraColumns?.() ?? {}),
  };

  const { error: failedUpdateError } = await (supabase as any)
    .from(table)
    .update(failedUpdate)
    .eq(cfg.orderIdColumn, orderId);
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
