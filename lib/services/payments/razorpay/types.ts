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
