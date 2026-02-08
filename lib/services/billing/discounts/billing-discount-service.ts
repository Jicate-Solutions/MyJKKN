import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingDiscount,
  DiscountFilters,
  DiscountListResponse,
  CreateDiscountDto,
  UpdateDiscountDto,
  BulkOperationResult,
  OutcomeVerification
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

      const billAmount = (billQuery.data as { total_amount: number }).total_amount;
      let discountAmount = 0;

      if (discountData.discount_type === 'percentage') {
        discountAmount = (billAmount * discountData.discount_value) / 100;
      } else {
        discountAmount = discountData.discount_value;
      }

      // Get current user for created_by field
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // Build insert object conditionally to avoid empty JSONB objects
      const insertData: any = {
        bill_id: discountData.bill_id,
        discount_category: discountData.discount_category,
        discount_type: discountData.discount_type,
        discount_value: discountData.discount_value,
        discount_amount: discountAmount,
        discount_reason: discountData.discount_reason,
        supporting_documents: discountData.supporting_documents,
        effective_date: discountData.effective_date,
        expiry_date: discountData.expiry_date,
        approval_status: 'pending',
        created_by: user?.id,
        is_outcome_based: discountData.is_outcome_based || false
      };

      // Only add outcome fields if actually outcome-based
      if (discountData.is_outcome_based && discountData.outcome_criteria) {
        insertData.outcome_criteria = discountData.outcome_criteria;
        insertData.outcome_verification = { verified: false, status: 'pending' };
      }

      const { data, error } = await this.supabase
        .from('billing_discounts')
        .insert(insertData)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingDiscount;
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
      const { data, error } = await (this.supabase as any)
        .from('billing_discounts')
        .update(discountData)
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingDiscount;
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
      let query = (this.supabase as any).from('billing_discounts').select(
        `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        // Search only in discount_reason as nested relation search doesn't work in or() clause
        query = query.ilike('discount_reason', `%${filters.search}%`);
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
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as BillingDiscount;
    } catch (error) {
      console.error('Error fetching discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch discount'
      );
    }
  }

  static async approveDiscount(id: string): Promise<BillingDiscount> {
    try {
      // First get the discount details to access bill_id and discount_amount
      const discountData = await this.getBillingDiscount(id);

      // Get current user
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // Get the current bill details
      const { data: billData, error: billError } = await this.supabase
        .from('billing_student_bills')
        .select('final_amount, balance_amount, status')
        .eq('id', discountData.bill_id)
        .single();

      if (billError) throw billError;

      const billDataTyped = billData as { final_amount: number; balance_amount: number; status: string };

      // Validate that discount doesn't exceed bill amount
      if (discountData.discount_amount > billDataTyped.final_amount) {
        throw new Error('Discount amount cannot exceed bill amount');
      }

      // Check if discount is already approved
      if (discountData.approval_status === 'approved') {
        throw new Error('This discount is already approved');
      }

      // Calculate new amounts after discount
      const newFinalAmount =
        billDataTyped.final_amount - discountData.discount_amount;

      // For balance_amount calculation:
      // - If bill is unpaid: balance_amount = new final_amount
      // - If bill is partially_paid: balance_amount = current balance - discount_amount (but not less than 0)
      let newBalanceAmount = 0;
      if (billDataTyped.status === 'unpaid') {
        newBalanceAmount = newFinalAmount;
      } else if (billDataTyped.status === 'partially_paid') {
        newBalanceAmount = Math.max(
          0,
          billDataTyped.balance_amount - discountData.discount_amount
        );
      }

      // Start a transaction to update both discount and bill
      const { data: updatedDiscount, error: discountError } =
        await (this.supabase as any)
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
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
          )
          .single();

      if (discountError) throw discountError;

      // Update the bill amounts
      const { error: billUpdateError } = await (this.supabase as any)
        .from('billing_student_bills')
        .update({
          final_amount: newFinalAmount,
          balance_amount: newBalanceAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', discountData.bill_id);

      if (billUpdateError) throw billUpdateError;

      // If balance becomes 0, mark bill as paid
      if (newBalanceAmount === 0 && billDataTyped.status !== 'paid') {
        const { error: statusUpdateError } = await (this.supabase as any)
          .from('billing_student_bills')
          .update({
            status: 'paid',
            payment_date: new Date().toISOString()
          })
          .eq('id', discountData.bill_id);

        if (statusUpdateError) throw statusUpdateError;
      }

      return updatedDiscount;
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

      const { data, error } = await (this.supabase as any)
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
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
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

  static async reverseDiscount(id: string): Promise<BillingDiscount> {
    try {
      // First get the discount details
      const discountData = await this.getBillingDiscount(id);

      if (discountData.approval_status !== 'approved') {
        throw new Error('Can only reverse approved discounts');
      }

      // Get current user
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // Get the current bill details
      const { data: billData, error: billError } = await this.supabase
        .from('billing_student_bills')
        .select(
          'final_amount, balance_amount, status, total_amount, tax_amount'
        )
        .eq('id', discountData.bill_id)
        .single();

      if (billError) throw billError;

      const billDataTyped = billData as { final_amount: number; balance_amount: number; status: string; total_amount: number; tax_amount: number };

      // Calculate restored amounts (add back the discount)
      const restoredFinalAmount =
        billDataTyped.final_amount + discountData.discount_amount;

      // For balance_amount calculation, add back the discount amount
      const restoredBalanceAmount =
        billDataTyped.balance_amount + discountData.discount_amount;

      // Update the discount status to 'reversed'
      const { data: updatedDiscount, error: discountError } =
        await (this.supabase as any)
          .from('billing_discounts')
          .update({
            approval_status: 'rejected', // We'll use rejected status for reversed discounts
            approval_date: new Date().toISOString(),
            authorizer_id: user?.id,
            discount_reason: `${discountData.discount_reason} (Reversed by ${
              user?.email || 'system'
            })`
          })
          .eq('id', id)
          .select(
            `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
          )
          .single();

      if (discountError) throw discountError;

      // Restore the bill amounts
      const { error: billUpdateError } = await (this.supabase as any)
        .from('billing_student_bills')
        .update({
          final_amount: restoredFinalAmount,
          balance_amount: restoredBalanceAmount,
          status: restoredBalanceAmount > 0 ? 'partially_paid' : 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', discountData.bill_id);

      if (billUpdateError) throw billUpdateError;

      return updatedDiscount;
    } catch (error) {
      console.error('Error reversing discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to reverse discount'
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

  // Utility method to get bill with discount calculations
  static async getBillWithDiscountSummary(billId: string): Promise<{
    bill: any;
    discounts: BillingDiscount[];
    originalAmount: number;
    totalDiscountAmount: number;
    effectiveAmount: number;
    appliedDiscounts: BillingDiscount[];
    pendingDiscounts: BillingDiscount[];
  }> {
    try {
      // Get bill details
      const { data: bill, error: billError } = await this.supabase
        .from('billing_student_bills')
        .select('*')
        .eq('id', billId)
        .single();

      if (billError) throw billError;

      // Get all discounts for this bill
      const { data: discounts, error: discountError } = await this.supabase
        .from('billing_discounts')
        .select('*')
        .eq('bill_id', billId)
        .order('created_at', { ascending: false });

      if (discountError) throw discountError;

      const discountsTyped = discounts as unknown as BillingDiscount[];
      const billTyped = bill as { total_amount: number; tax_amount: number; final_amount: number };

      // Calculate discount totals
      const appliedDiscounts = discountsTyped.filter(
        (d: any) => d.approval_status === 'approved'
      );
      const pendingDiscounts = discountsTyped.filter(
        (d: any) => d.approval_status === 'pending'
      );
      const totalDiscountAmount = appliedDiscounts.reduce(
        (sum: number, d: any) => sum + d.discount_amount,
        0
      );

      // Calculate effective amount (this should match bill.final_amount if our logic is correct)
      const originalAmount = billTyped.total_amount + (billTyped.tax_amount || 0);
      const effectiveAmount = originalAmount - totalDiscountAmount;

      return {
        bill,
        discounts: discountsTyped as BillingDiscount[],
        originalAmount,
        totalDiscountAmount,
        effectiveAmount,
        appliedDiscounts: appliedDiscounts as BillingDiscount[],
        pendingDiscounts: pendingDiscounts as BillingDiscount[]
      };
    } catch (error) {
      console.error('Error getting bill with discount summary:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to get bill discount summary'
      );
    }
  }

  // ============================================
  // OUTCOME-BASED DISCOUNT METHODS
  // ============================================

  static async createOutcomeDiscount(
    discountData: CreateDiscountDto
  ): Promise<BillingDiscount> {
    try {
      // Ensure outcome fields are set
      const outcomeData: CreateDiscountDto = {
        ...discountData,
        is_outcome_based: true,
        outcome_criteria: discountData.outcome_criteria || {
          type: 'competency_achievement',
          competency_ids: [],
          minimum_level: 'intermediate',
          min_score: 0,
          evaluation_period_days: 90
        }
      };

      // Calculate discount amount based on type and value
      const billQuery = await this.supabase
        .from('billing_student_bills')
        .select('total_amount')
        .eq('id', outcomeData.bill_id)
        .single();

      if (billQuery.error) throw billQuery.error;

      const billAmount = (billQuery.data as { total_amount: number }).total_amount;
      let discountAmount = 0;

      if (outcomeData.discount_type === 'percentage') {
        discountAmount = (billAmount * outcomeData.discount_value) / 100;
      } else {
        discountAmount = outcomeData.discount_value;
      }

      // Get current user for created_by field
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      const { data, error } = await this.supabase
        .from('billing_discounts')
        .insert({
          bill_id: outcomeData.bill_id,
          discount_category: outcomeData.discount_category,
          discount_type: outcomeData.discount_type,
          discount_value: outcomeData.discount_value,
          discount_amount: discountAmount,
          discount_reason: outcomeData.discount_reason,
          supporting_documents: outcomeData.supporting_documents,
          effective_date: outcomeData.effective_date,
          expiry_date: outcomeData.expiry_date,
          approval_status: 'pending',
          created_by: user?.id,
          is_outcome_based: true,
          outcome_criteria: outcomeData.outcome_criteria,
          outcome_verification: {
            verified: false,
            status: 'pending'
          }
        } as any)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingDiscount;
    } catch (error) {
      console.error('Error creating outcome discount:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create outcome discount'
      );
    }
  }

  static async verifyOutcomeDiscount(
    discountId: string,
    verifiedBy: string,
    evidence: string[]
  ): Promise<BillingDiscount> {
    try {
      const verification: OutcomeVerification = {
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: verifiedBy,
        evidence_urls: evidence,
        status: 'verified'
      };

      const { data, error } = await (this.supabase as any)
        .from('billing_discounts')
        .update({
          outcome_verification: verification
        })
        .eq('id', discountId)
        .eq('is_outcome_based', true)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingDiscount;
    } catch (error) {
      console.error('Error verifying outcome discount:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to verify outcome discount'
      );
    }
  }

  static async getOutcomeDiscounts(
    institutionId: string
  ): Promise<BillingDiscount[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('billing_discounts')
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            institution_id,
            student:students (
              id,
              first_name,
              last_name,
              student_id,
              email
            )
          ),
          authorizer:profiles (
            id,
            full_name
          )
        `
        )
        .eq('is_outcome_based', true)
        .eq('bill.institution_id', institutionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as BillingDiscount[];
    } catch (error) {
      console.error('Error fetching outcome discounts:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch outcome discounts'
      );
    }
  }
}
