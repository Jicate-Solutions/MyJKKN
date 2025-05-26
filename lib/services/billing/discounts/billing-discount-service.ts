import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingDiscount,
  DiscountFilters,
  DiscountListResponse,
  CreateDiscountDto,
  UpdateDiscountDto,
  BulkOperationResult
} from '@/types/billing-schedule';

export class BillingDiscountService {
  private static supabase = createClientSupabaseClient();

  static async createBillingDiscount(
    discountData: CreateDiscountDto
  ): Promise<BillingDiscount> {
    try {
      // Calculate discount amount based on type and value
      const billQuery = await this.supabase
        .from('billing_student_bills')
        .select('total_amount')
        .eq('id', discountData.bill_id)
        .single();

      if (billQuery.error) throw billQuery.error;

      const billAmount = billQuery.data.total_amount;
      let discountAmount = 0;

      if (discountData.discount_type === 'percentage') {
        discountAmount = (billAmount * discountData.discount_value) / 100;
      } else {
        discountAmount = discountData.discount_value;
      }

      const { data, error } = await this.supabase
        .from('billing_discounts')
        .insert({
          bill_id: discountData.bill_id,
          discount_category: discountData.discount_category,
          discount_type: discountData.discount_type,
          discount_value: discountData.discount_value,
          discount_amount: discountAmount,
          discount_reason: discountData.discount_reason,
          supporting_documents: discountData.supporting_documents,
          effective_date: discountData.effective_date,
          expiry_date: discountData.expiry_date,
          approval_status: 'pending'
        })
        .select(
          `
          *,
          bill:billing_student_bills!billing_discounts_bill_id_fkey (
            id,
            bill_description,
            total_amount,
            student:students!billing_student_bills_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_discounts_authorizer_id_fkey (
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
      console.error('Error creating discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create discount'
      );
    }
  }

  static async updateBillingDiscount(
    id: string,
    discountData: UpdateDiscountDto
  ): Promise<BillingDiscount> {
    try {
      const { data, error } = await this.supabase
        .from('billing_discounts')
        .update(discountData)
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_student_bills!billing_discounts_bill_id_fkey (
            id,
            bill_description,
            total_amount,
            student:students!billing_student_bills_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_discounts_authorizer_id_fkey (
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
      console.error('Error updating discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update discount'
      );
    }
  }

  static async deleteBillingDiscount(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_discounts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete discount'
      );
    }
  }

  static async getBillingDiscounts(
    filters: DiscountFilters = {}
  ): Promise<DiscountListResponse> {
    try {
      let query = this.supabase.from('billing_discounts').select(
        `
          *,
          bill:billing_student_bills!billing_discounts_bill_id_fkey (
            id,
            bill_description,
            total_amount,
            student:students!billing_student_bills_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_discounts_authorizer_id_fkey (
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
          `discount_reason.ilike.%${filters.search}%,bill.student.student_name.ilike.%${filters.search}%`
        );
      }

      if (filters.bill_id) {
        query = query.eq('bill_id', filters.bill_id);
      }

      if (filters.discount_category) {
        query = query.eq('discount_category', filters.discount_category);
      }

      if (filters.discount_type) {
        query = query.eq('discount_type', filters.discount_type);
      }

      if (filters.approval_status) {
        query = query.eq('approval_status', filters.approval_status);
      }

      if (filters.effective_date_from) {
        query = query.gte('effective_date', filters.effective_date_from);
      }

      if (filters.effective_date_to) {
        query = query.lte('effective_date', filters.effective_date_to);
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
      console.error('Error fetching discounts:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch discounts'
      );
    }
  }

  static async getBillingDiscount(id: string): Promise<BillingDiscount> {
    try {
      const { data, error } = await this.supabase
        .from('billing_discounts')
        .select(
          `
          *,
          bill:billing_student_bills!billing_discounts_bill_id_fkey (
            id,
            bill_description,
            total_amount,
            student:students!billing_student_bills_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_discounts_authorizer_id_fkey (
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
      console.error('Error fetching discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch discount'
      );
    }
  }

  static async approveDiscount(id: string): Promise<BillingDiscount> {
    try {
      // Get current user - this would come from auth context in real implementation
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      const { data, error } = await this.supabase
        .from('billing_discounts')
        .update({
          approval_status: 'approved',
          approval_date: new Date().toISOString(),
          authorizer_id: user?.id
        })
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_student_bills!billing_discounts_bill_id_fkey (
            id,
            bill_description,
            total_amount,
            student:students!billing_student_bills_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_discounts_authorizer_id_fkey (
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
      console.error('Error approving discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to approve discount'
      );
    }
  }

  static async rejectDiscount(
    id: string,
    reason: string
  ): Promise<BillingDiscount> {
    try {
      // Get current user - this would come from auth context in real implementation
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // First get the current discount to access the discount_reason
      const currentDiscount = await this.getBillingDiscount(id);

      const { data, error } = await this.supabase
        .from('billing_discounts')
        .update({
          approval_status: 'rejected',
          approval_date: new Date().toISOString(),
          authorizer_id: user?.id,
          discount_reason: `${currentDiscount.discount_reason} (Rejected: ${reason})`
        })
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_student_bills!billing_discounts_bill_id_fkey (
            id,
            bill_description,
            total_amount,
            student:students!billing_student_bills_student_id_fkey (
              id,
              student_name,
              roll_number,
              student_email
            )
          ),
          authorizer:users!billing_discounts_authorizer_id_fkey (
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
      console.error('Error rejecting discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to reject discount'
      );
    }
  }

  static async bulkApplyDiscounts(
    discounts: CreateDiscountDto[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const discountData of discounts) {
      try {
        const discount = await this.createBillingDiscount(discountData);
        results.success.push(discount.id);
      } catch (error) {
        results.failed.push({
          id: discountData.bill_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }
}
