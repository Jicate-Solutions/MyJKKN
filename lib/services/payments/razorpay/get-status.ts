// lib/services/payments/razorpay/get-status.ts
import type { GetStatusResult } from '../provider';
import type { Paise } from '../amount';
import type { RazorpayOrder, RazorpayPayment } from './types';
import type { RazorpayApiAuth } from './credentials';
import { razorpayRequest, RazorpayApiError } from './client';

export async function getOrderStatus(orderId: string, auth: RazorpayApiAuth): Promise<GetStatusResult> {
  const order = await razorpayRequest<RazorpayOrder>('GET', `/orders/${encodeURIComponent(orderId)}`, auth);
  // Order status mapping: created → 'created', attempted → 'failed' (best effort), paid → 'captured'
  const normalized: GetStatusResult['status'] =
    order.status === 'paid' ? 'captured' :
    order.status === 'created' ? 'created' :
    'failed';
  return {
    status: normalized,
    amountPaise: order.amount as Paise,
    amountRefundedPaise: (order.amount - order.amount_due) as Paise,
    capturedAt: order.status === 'paid' ? new Date(order.created_at * 1000) : null,
    raw: order,
  };
}

export async function getPaymentStatus(paymentId: string, auth: RazorpayApiAuth): Promise<GetStatusResult> {
  const payment = await razorpayRequest<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`, auth);
  const normalized: GetStatusResult['status'] =
    payment.status === 'captured' ? 'captured' :
    payment.status === 'authorized' ? 'authorized' :
    payment.status === 'refunded' ? 'refunded' :
    payment.status === 'failed' ? 'failed' :
    'created';
  return {
    status: normalized,
    amountPaise: payment.amount as Paise,
    amountRefundedPaise: payment.amount_refunded as Paise,
    capturedAt: payment.captured ? new Date(payment.created_at * 1000) : null,
    raw: payment,
  };
}

/**
 * All payment attempts made against an order, newest-first as Razorpay returns them.
 *
 * Needed by the reconciliation sweep: when the browser never posts the callback we
 * only ever learn the ORDER id, but a receipt has to carry the real `pay_…`
 * reference. GET /orders/{id} alone cannot supply that.
 */
export async function getOrderPayments(orderId: string, auth: RazorpayApiAuth): Promise<RazorpayPayment[]> {
  const res = await razorpayRequest<{ items?: RazorpayPayment[] }>(
    'GET',
    `/orders/${encodeURIComponent(orderId)}/payments`,
    auth,
  );
  return res?.items ?? [];
}

export async function dualInquiry(orderId: string, paymentId: string | undefined, auth: RazorpayApiAuth): Promise<GetStatusResult> {
  // Per security audit checklist: dual inquiry means we check BOTH endpoints when possible
  const orderStatus = await getOrderStatus(orderId, auth);
  if (!paymentId) return orderStatus;
  try {
    return await getPaymentStatus(paymentId, auth);
  } catch (err) {
    if (err instanceof RazorpayApiError && err.status === 404) {
      return orderStatus;
    }
    throw err;
  }
}
