import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingRefund,
  RefundFilters,
  RefundListResponse,
  CreateRefundDto,
  UpdateRefundDto,
  BulkOperationResult
} from '@/types/billing-schedule';

export class BillingRefundService {
  private static supabase = createClientSupabaseClient();

  static async createBillingRefund(
    refundData: CreateRefundDto
  ): Promise<BillingRefund> {
    try {
      // Calculate net refund amount (refund amount - processing fee)
      const processingFee = refundData.processing_fee || 0;
      const netRefundAmount = refundData.refund_amount - processingFee;

      const { data, error } = await this.supabase
        .from('billing_refunds')
        .insert({
          receipt_id: refundData.receipt_id,
          refund_category: refundData.refund_category,
          refund_amount: refundData.refund_amount,
          refund_date: refundData.refund_date,
          refund_method: refundData.refund_method,
          bank_details: refundData.bank_details,
          refund_reason: refundData.refund_reason,
          supporting_documents: refundData.supporting_documents,
          processing_fee: processingFee,
          net_refund_amount: netRefundAmount,
          approval_status: 'pending'
        })
        .select(
          `
          *,
          receipt:billing_receipts!billing_refunds_receipt_id_fkey (
            id,
            receipt_number,
            payment_amount,
            student:students!billing_receipts_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_refunds_authorizer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating refund:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create refund'
      );
    }
  }

  static async updateBillingRefund(
    id: string,
    refundData: UpdateRefundDto
  ): Promise<BillingRefund> {
    try {
      const { data, error } = await this.supabase
        .from('billing_refunds')
        .update(refundData)
        .eq('id', id)
        .select(
          `
          *,
          receipt:billing_receipts!billing_refunds_receipt_id_fkey (
            id,
            receipt_number,
            payment_amount,
            student:students!billing_receipts_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_refunds_authorizer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating refund:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update refund'
      );
    }
  }

  static async deleteBillingRefund(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_refunds')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting refund:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete refund'
      );
    }
  }

  static async getBillingRefunds(
    filters: RefundFilters = {}
  ): Promise<RefundListResponse> {
    try {
      let query = this.supabase.from('billing_refunds').select(
        `
          *,
          receipt:billing_receipts!billing_refunds_receipt_id_fkey (
            id,
            receipt_number,
            payment_amount,
            student:students!billing_receipts_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_refunds_authorizer_id_fkey (
            id,
            first_name,
            last_name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `refund_reason.ilike.%${filters.search}%,receipt.student.student_name.ilike.%${filters.search}%`
        );
      }

      if (filters.receipt_id) {
        query = query.eq('receipt_id', filters.receipt_id);
      }

      if (filters.refund_category) {
        query = query.eq('refund_category', filters.refund_category);
      }

      if (filters.refund_method) {
        query = query.eq('refund_method', filters.refund_method);
      }

      if (filters.approval_status) {
        query = query.eq('approval_status', filters.approval_status);
      }

      if (filters.refund_date_from) {
        query = query.gte('refund_date', filters.refund_date_from);
      }

      if (filters.refund_date_to) {
        query = query.lte('refund_date', filters.refund_date_to);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      // Apply sorting
      query = query.order('created_at', { ascending: false });

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching refunds:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch refunds'
      );
    }
  }

  static async getBillingRefund(id: string): Promise<BillingRefund> {
    try {
      const { data, error } = await this.supabase
        .from('billing_refunds')
        .select(
          `
          *,
          receipt:billing_receipts!billing_refunds_receipt_id_fkey (
            id,
            receipt_number,
            payment_amount,
            student:students!billing_receipts_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_refunds_authorizer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching refund:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch refund'
      );
    }
  }

  static async approveRefund(id: string): Promise<BillingRefund> {
    try {
      // Get current user - this would come from auth context in real implementation
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      const { data, error } = await this.supabase
        .from('billing_refunds')
        .update({
          approval_status: 'approved',
          authorizer_id: user?.id
        })
        .eq('id', id)
        .select(
          `
          *,
          receipt:billing_receipts!billing_refunds_receipt_id_fkey (
            id,
            receipt_number,
            payment_amount,
            student:students!billing_receipts_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_refunds_authorizer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error approving refund:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to approve refund'
      );
    }
  }

  static async processRefund(id: string): Promise<BillingRefund> {
    try {
      const { data, error } = await this.supabase
        .from('billing_refunds')
        .update({
          approval_status: 'completed'
        })
        .eq('id', id)
        .select(
          `
          *,
          receipt:billing_receipts!billing_refunds_receipt_id_fkey (
            id,
            receipt_number,
            payment_amount,
            student:students!billing_receipts_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_refunds_authorizer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to process refund'
      );
    }
  }

  static async bulkProcessRefunds(
    refunds: CreateRefundDto[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const refund of refunds) {
      try {
        const created = await this.createBillingRefund(refund);
        results.success.push(created.id);
      } catch (error) {
        results.failed.push({
          id: refund.receipt_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }
}
