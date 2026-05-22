// lib/services/payments/razorpay/get-status.ts
import type { GetStatusResult } from '../provider';
import type { Paise } from '../amount';
import type { RazorpayOrder, RazorpayPayment } from './types';
import { razorpayRequest, RazorpayApiError } from './client';

export async function getOrderStatus(orderId: string): Promise<GetStatusResult> {
  const order = await razorpayRequest<RazorpayOrder>('GET', `/orders/${encodeURIComponent(orderId)}`);
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

export async function getPaymentStatus(paymentId: string): Promise<GetStatusResult> {
  const payment = await razorpayRequest<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);
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

export async function dualInquiry(orderId: string, paymentId?: string): Promise<GetStatusResult> {
  // Per security audit checklist: dual inquiry means we check BOTH endpoints when possible
  const orderStatus = await getOrderStatus(orderId);
  if (!paymentId) return orderStatus;
  try {
    return await getPaymentStatus(paymentId);
  } catch (err) {
    if (err instanceof RazorpayApiError && err.status === 404) {
      return orderStatus;
    }
    throw err;
  }
}
