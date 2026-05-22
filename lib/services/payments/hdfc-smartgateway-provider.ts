// lib/services/payments/hdfc-smartgateway-provider.ts
import type {
  CreateOrderInput, CreateOrderResult, GetStatusResult,
  CreateRefundInput, CreateRefundResult,
  PaymentProvider, VerifySignatureInput, VerifyWebhookInput,
} from './provider';

/**
 * Adapter exposing the existing HDFC SmartGateway integration through the PaymentProvider
 * interface. The HDFC flow continues to be driven by the existing PaymentGatewayService /
 * HDFCEventClient code; this adapter exists so getPaymentProvider() can return a type-uniform
 * value during cutover. Once HDFC is decommissioned (Phase 13), this file is deleted.
 */
export class HdfcSmartGatewayProvider implements PaymentProvider {
  readonly name = 'hdfc_smartgateway' as const;

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new Error(
      'HdfcSmartGatewayProvider.createOrder() must not be called directly. ' +
      'HDFC paths still flow through PaymentGatewayService.createPaymentSession().',
    );
  }

  verifySignature(_input: VerifySignatureInput): boolean {
    throw new Error('HDFC SmartGateway does not use Razorpay-style signature verification.');
  }

  verifyWebhookSignature(_input: VerifyWebhookInput): boolean {
    throw new Error('Use PaymentGatewayService.verifyWebhookSignature for HDFC webhooks.');
  }

  async getOrderStatus(_gatewayOrderId: string): Promise<GetStatusResult> {
    throw new Error('Use PaymentGatewayService.checkPaymentStatus for HDFC.');
  }

  async getPaymentStatus(gatewayPaymentId: string): Promise<GetStatusResult> {
    return this.getOrderStatus(gatewayPaymentId);
  }

  async createRefund(_input: CreateRefundInput): Promise<CreateRefundResult> {
    throw new Error('HDFC SmartGateway refunds are manual; no gateway API call.');
  }
}
