import type { Paise } from './amount';

export type PaymentModule = 'billing' | 'events' | 'ims' | 'courses';

export type PaymentProviderName = 'hdfc_smartgateway' | 'razorpay';

export interface CreateOrderInput {
  /** Internal transaction reference (we generate). Razorpay calls this `receipt`. */
  transactionRef: string;
  amountPaise: Paise;
  currency: 'INR';
  /** Module that originated the payment — used by webhook to route. */
  module: PaymentModule;
  /** Free-form notes attached to the gateway record (returned in webhooks). */
  notes?: Record<string, string>;
  /** Customer-facing description (shown in checkout). */
  description?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface CreateOrderResult {
  provider: PaymentProviderName;
  /** Gateway-issued order identifier (e.g., Razorpay `order_xxx` or HDFC session id). */
  gatewayOrderId: string;
  /** Public key/id needed by the client to launch checkout. NULL for HDFC redirect flow. */
  clientKeyId?: string;
  /** Full-page redirect URL (HDFC) — empty for Razorpay modal flow. */
  redirectUrl?: string;
  /** Raw gateway response (stored in gateway_response JSONB column for audit). */
  raw: unknown;
}

export interface VerifySignatureInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}

export interface VerifyWebhookInput {
  rawBody: string;
  signatureHeader: string;
}

export interface GetStatusResult {
  /** Normalized status across providers. */
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  amountPaise: Paise;
  amountRefundedPaise: Paise;
  capturedAt: Date | null;
  raw: unknown;
}

export interface CreateRefundInput {
  gatewayPaymentId: string;
  amountPaise: Paise;
  /** Idempotency key — Razorpay deduplicates refund requests by this. */
  refundReference: string;
  notes?: Record<string, string>;
}

export interface CreateRefundResult {
  gatewayRefundId: string;
  status: 'pending' | 'processed' | 'failed';
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifySignature(input: VerifySignatureInput): boolean;
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
  getOrderStatus(gatewayOrderId: string): Promise<GetStatusResult>;
  getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
}
