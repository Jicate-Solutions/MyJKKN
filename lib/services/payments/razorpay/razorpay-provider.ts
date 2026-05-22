// lib/services/payments/razorpay/razorpay-provider.ts
import type {
  CreateOrderInput, CreateOrderResult,
  GetStatusResult, CreateRefundInput, CreateRefundResult,
  PaymentProvider, VerifySignatureInput, VerifyWebhookInput,
} from '../provider';
import { createOrder } from './create-order';
import { verifySignature } from './verify-signature';
import { verifyWebhookSignature } from './verify-webhook';
import { getOrderStatus, getPaymentStatus } from './get-status';
import { createRefund } from './create-refund';

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const order = await createOrder({
      transactionRef: input.transactionRef,
      amountPaise: input.amountPaise,
      currency: input.currency,
      module: input.module,
      notes: input.notes,
    });
    return {
      provider: 'razorpay',
      gatewayOrderId: order.id,
      clientKeyId: process.env.RAZORPAY_KEY_ID ?? '',
      redirectUrl: undefined,
      raw: order,
    };
  }

  verifySignature(input: VerifySignatureInput): boolean {
    return verifySignature(input);
  }

  verifyWebhookSignature(input: VerifyWebhookInput): boolean {
    return verifyWebhookSignature(input);
  }

  async getOrderStatus(gatewayOrderId: string): Promise<GetStatusResult> {
    return getOrderStatus(gatewayOrderId);
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult> {
    return getPaymentStatus(gatewayPaymentId);
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    return createRefund(input);
  }
}
