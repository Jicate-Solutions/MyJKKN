// lib/services/admission/seat-confirmation-service.ts
// Service for admission_payments + offer_letters for seat confirmation tracking

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AdmissionPaymentRow {
  id: string;
  institution_id: string;
  application_id: string;
  payment_type: string; // 'application_fee' | 'token_fee' | 'tuition' etc.
  amount: number;
  currency: string;
  fee_breakdown: Record<string, unknown> | null;
  discount_amount: number;
  discount_reason: string | null;
  scholarship_id: string | null;
  status: string; // 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded'
  payment_method: string | null;
  gateway_name: string | null;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  gateway_signature: string | null;
  due_date: string | null;
  paid_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  refunded_at: string | null;
  refund_reference: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  application?: {
    id: string;
    application_number: string;
    program_id: string | null;
    lead_id: string | null;
    form_data: Record<string, unknown> | null;
    status: string;
    admission_lead?: {
      id: string;
      full_name: string;
      email: string;
      phone: string;
    } | null;
  } | null;
}

export interface PaymentFilters {
  institutionId: string;
  status?: string;
  paymentType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface RecordPaymentInput {
  institution_id: string;
  application_id: string;
  payment_type: string;
  amount: number;
  currency?: string;
  payment_method: string;
  gateway_payment_id?: string;
  receipt_number?: string;
  due_date?: string;
}

export interface RefundInput {
  id: string;
  refund_amount: number;
  refund_reason: string;
  refund_reference?: string;
}

export interface PaymentStats {
  totalCollected: number;
  pendingAmount: number;
  refundPending: number;
  confirmedCount: number;
  pendingPaymentCount: number;
  pendingDocsCount: number;
  paymentsByMethod: { method: string; amount: number }[];
}

export class SeatConfirmationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  static async getPayments(filters: PaymentFilters) {
    const { institutionId, status, paymentType, search, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('admission_payments')
      .select(`
        *,
        application:admission_applications!application_id (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status,
          admission_lead:admission_leads!lead_id (
            id,
            full_name,
            email,
            phone
          )
        )
      `, { count: 'exact' })
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (paymentType && paymentType !== 'all') {
      query = query.eq('payment_type', paymentType);
    }

    if (search) {
      query = query.or(`receipt_number.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/payments] Error fetching payments:', error);
      throw error;
    }

    return {
      data: (data || []) as AdmissionPaymentRow[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  static async recordPayment(input: RecordPaymentInput) {
    const receiptNum = input.receipt_number || `REC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

    const { data, error } = await this.supabase
      .from('admission_payments')
      .insert({
        institution_id: input.institution_id,
        application_id: input.application_id,
        payment_type: input.payment_type,
        amount: input.amount,
        currency: input.currency || 'INR',
        discount_amount: 0,
        status: 'paid',
        payment_method: input.payment_method,
        gateway_payment_id: input.gateway_payment_id || null,
        due_date: input.due_date || null,
        paid_at: new Date().toISOString(),
        reminder_count: 0,
        receipt_number: receiptNum,
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/payments] Error recording payment:', error);
      throw error;
    }

    return data as AdmissionPaymentRow;
  }

  static async processRefund(input: RefundInput) {
    const { data, error } = await this.supabase
      .from('admission_payments')
      .update({
        status: 'refund_pending',
        refund_amount: input.refund_amount,
        refund_reason: input.refund_reason,
        refund_reference: input.refund_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      console.error('[admission/payments] Error processing refund:', error);
      throw error;
    }

    return data as AdmissionPaymentRow;
  }

  static async getPaymentStats(institutionId: string): Promise<PaymentStats> {
    const { data, error } = await this.supabase
      .from('admission_payments')
      .select('status, amount, payment_method, payment_type, refund_amount')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[admission/payments] Error fetching stats:', error);
      throw error;
    }

    const rows = data || [];
    const paid = rows.filter((r: { status: string }) => r.status === 'paid');
    const pending = rows.filter((r: { status: string }) => r.status === 'pending');
    const refundPendingRows = rows.filter((r: { status: string }) => r.status === 'refund_pending');

    const totalCollected = paid.reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);
    const pendingAmount = pending.reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);
    const refundPending = refundPendingRows.reduce((sum: number, r: { refund_amount: number | null; amount: number }) => sum + (r.refund_amount || r.amount || 0), 0);

    // Group by payment method
    const methodMap: Record<string, number> = {};
    paid.forEach((r: { payment_method: string; amount: number }) => {
      const method = r.payment_method || 'unknown';
      methodMap[method] = (methodMap[method] || 0) + (r.amount || 0);
    });
    const paymentsByMethod = Object.entries(methodMap).map(([method, amount]) => ({ method, amount }));

    return {
      totalCollected,
      pendingAmount,
      refundPending,
      confirmedCount: paid.length,
      pendingPaymentCount: pending.length,
      pendingDocsCount: 0,
      paymentsByMethod,
    };
  }
}
