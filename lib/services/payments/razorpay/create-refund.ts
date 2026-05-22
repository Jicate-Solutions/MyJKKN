// lib/services/payments/razorpay/create-refund.ts
import type { CreateRefundInput, CreateRefundResult } from '../provider';
import type { RazorpayRefund } from './types';
import { razorpayRequest } from './client';

export async function createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
  const params = new URLSearchParams();
  params.set('amount', String(input.amountPaise));
  // Razorpay deduplicates refunds by receipt within an idempotency window
  params.set('receipt', input.refundReference);
  for (const [k, v] of Object.entries(input.notes ?? {})) {
    params.set(`notes[${k}]`, v);
  }
  const refund = await razorpayRequest<RazorpayRefund>(
    'POST',
    `/payments/${encodeURIComponent(input.gatewayPaymentId)}/refund`,
    params,
  );
  return {
    gatewayRefundId: refund.id,
    status: refund.status,
    raw: refund,
  };
}
