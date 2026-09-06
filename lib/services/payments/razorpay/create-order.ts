// lib/services/payments/razorpay/create-order.ts
import type { Paise } from '../amount';
import type { PaymentModule } from '../provider';
import type { RazorpayOrder } from './types';
import type { RazorpayApiAuth } from './credentials';
import { razorpayRequest } from './client';

interface CreateOrderArgs {
  transactionRef: string;
  amountPaise: Paise;
  currency: 'INR';
  module: PaymentModule;
  notes?: Record<string, string>;
}

export async function createOrder(args: CreateOrderArgs, auth: RazorpayApiAuth): Promise<RazorpayOrder> {
  const params = new URLSearchParams();
  params.set('amount', String(args.amountPaise));
  params.set('currency', args.currency);
  params.set('receipt', args.transactionRef);
  params.set('payment_capture', '1');
  // Always tag notes.module so the webhook handler can route by it
  params.set('notes[module]', args.module);
  for (const [k, v] of Object.entries(args.notes ?? {})) {
    params.set(`notes[${k}]`, v);
  }
  return razorpayRequest<RazorpayOrder>('POST', '/orders', auth, params);
}
