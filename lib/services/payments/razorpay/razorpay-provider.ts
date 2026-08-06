// lib/services/payments/razorpay/razorpay-provider.ts
import type {
  CreateOrderInput, CreateOrderResult,
  GetStatusResult, CreateRefundInput, CreateRefundResult,
  PaymentProvider, VerifySignatureInput, VerifyWebhookInput,
} from '../provider';
import type { RazorpayApiAuth, RazorpayCredentials } from './credentials';
import type { RazorpayPayment, RazorpayQrCode } from './types';
import { createOrder } from './create-order';
import {
  createQrCode,
  getQrCode,
  getQrCodePayments,
  closeQrCode,
  type CreateQrCodeArgs,
} from './qr-code';
import { verifySignature } from './verify-signature';
import { verifyWebhookSignature } from './verify-webhook';
import { getOrderStatus, getPaymentStatus, getOrderPayments, dualInquiry } from './get-status';
import { createRefund } from './create-refund';

/**
 * Razorpay provider with constructor-injected credentials. The credentials are
 * resolved per-institution (or from the common env account) by the factory; this
 * class never reads process.env for keys.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  constructor(private readonly creds: RazorpayCredentials) {}

  private get auth(): RazorpayApiAuth {
    return { keyId: this.creds.keyId, keySecret: this.creds.keySecret };
  }

  /** The account row this provider is bound to (null when using the env fallback). */
  get accountId(): string | undefined {
    return this.creds.accountId;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const order = await createOrder(
      {
        transactionRef: input.transactionRef,
        amountPaise: input.amountPaise,
        currency: input.currency,
        module: input.module,
        notes: input.notes,
      },
      this.auth,
    );
    return {
      provider: 'razorpay',
      gatewayOrderId: order.id,
      clientKeyId: this.creds.keyId,
      redirectUrl: undefined,
      raw: order,
    };
  }

  verifySignature(input: VerifySignatureInput): boolean {
    return verifySignature(input, this.creds.keySecret);
  }

  verifyWebhookSignature(input: VerifyWebhookInput): boolean {
    return verifyWebhookSignature(input, this.creds.webhookSecret);
  }

  async getOrderStatus(gatewayOrderId: string): Promise<GetStatusResult> {
    return getOrderStatus(gatewayOrderId, this.auth);
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult> {
    return getPaymentStatus(gatewayPaymentId, this.auth);
  }

  /**
   * Every payment attempt against an order. Used by the reconciliation sweep to
   * recover the `pay_…` id when only the order id is known.
   */
  async getOrderPayments(gatewayOrderId: string): Promise<RazorpayPayment[]> {
    return getOrderPayments(gatewayOrderId, this.auth);
  }

  /**
   * Dual inquiry (GET /orders + GET /payments) — mandatory per the Razorpay
   * security audit. Not on the PaymentProvider interface (HDFC has no equivalent);
   * call on a RazorpayProvider instance directly.
   */
  async dualInquiry(gatewayOrderId: string, gatewayPaymentId?: string): Promise<GetStatusResult> {
    return dualInquiry(gatewayOrderId, gatewayPaymentId, this.auth);
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    return createRefund(input, this.auth);
  }

  // ── QR collection ─────────────────────────────────────────────────────────
  // Deliberately NOT on the PaymentProvider interface. A QR is a Razorpay
  // product; forcing it onto the interface would oblige any future provider to
  // pretend it has one. Same reasoning as dualInquiry above.
  //
  // These are methods rather than free functions the caller invokes directly so
  // that keySecret never leaves the provider — a caller reaching for
  // RazorpayApiAuth itself would break the one invariant this class exists for.

  /** Open a single-use, fixed-amount UPI QR for a counter sale. */
  async createQrCode(input: CreateQrCodeArgs): Promise<RazorpayQrCode> {
    return createQrCode(input, this.auth);
  }

  /** Current state of a QR (active / closed, amount received). */
  async getQrCode(qrCodeId: string): Promise<RazorpayQrCode> {
    return getQrCode(qrCodeId, this.auth);
  }

  /**
   * Payments credited against a QR. The pull side of the webhook — use this to
   * confirm a pending QR rather than trusting the webhook to always arrive.
   */
  async getQrCodePayments(qrCodeId: string): Promise<RazorpayPayment[]> {
    return getQrCodePayments(qrCodeId, this.auth);
  }

  /** Stop a QR being payable (counter cancelled, or our timeout elapsed). */
  async closeQrCode(qrCodeId: string): Promise<RazorpayQrCode> {
    return closeQrCode(qrCodeId, this.auth);
  }
}
