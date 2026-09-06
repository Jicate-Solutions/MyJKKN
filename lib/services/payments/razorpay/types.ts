// lib/services/payments/razorpay/types.ts

export interface RazorpayOrder {
  id: string;                    // order_XXXXX
  entity: 'order';
  amount: number;                // paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, string>;
  created_at: number;            // unix seconds
}

/**
 * A Razorpay-hosted UPI QR code (POST /v1/payments/qr_codes).
 *
 * Unlike an order, a QR is a standing collection instrument: the customer scans it
 * with any UPI app and Razorpay credits it, announcing the payment through the
 * `qr_code.credited` webhook. There is no order_id on the resulting payment, so it
 * is tracked by `id` (qr_XXXXX) rather than by order.
 */
export interface RazorpayQrCode {
  id: string;                    // qr_XXXXX
  entity: 'qr_code';
  created_at: number;            // unix seconds
  name: string;
  usage: 'single_use' | 'multiple_use';
  type: 'upi_qr' | 'bharat_qr';
  image_url: string;
  payment_amount: number | null; // paise; null when fixed_amount is false
  status: 'active' | 'closed';
  description: string | null;
  fixed_amount: boolean;
  payments_amount_received: number;
  payments_count_received: number;
  notes: Record<string, string>;
  close_by: number | null;       // unix seconds
  closed_at: number | null;
  close_reason: 'on_demand' | 'paid' | 'completed' | null;
}

export interface RazorpayPayment {
  id: string;                    // pay_XXXXX
  entity: 'payment';
  amount: number;                // paise
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: 'card' | 'netbanking' | 'wallet' | 'upi' | 'emi' | string;
  amount_refunded: number;
  refund_status: 'null' | 'partial' | 'full' | null;
  captured: boolean;
  description: string | null;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string;
  contact: string;
  notes: Record<string, string>;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  created_at: number;
}

export interface RazorpayRefund {
  id: string;                    // rfnd_XXXXX
  entity: 'refund';
  amount: number;                // paise
  currency: string;
  payment_id: string;
  notes: Record<string, string>;
  receipt: string | null;
  status: 'pending' | 'processed' | 'failed';
  created_at: number;
}

export interface RazorpayError {
  error: {
    code: string;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
  };
}
