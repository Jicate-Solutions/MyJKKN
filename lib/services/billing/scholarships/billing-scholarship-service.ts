import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser, BillingActivityTemplates } from '@/lib/utils/activity-logger-client';
import type {
  BillingScholarship,
  ScholarshipFilters,
  ScholarshipListResponse,
  CreateScholarshipDto,
  UpdateScholarshipDto,
  BulkOperationResult
} from '@/types/billing-schedule';

export class BillingScholarshipService {
  private static supabase = createClientSupabaseClient();

  static async createBillingScholarship(
    scholarshipData: CreateScholarshipDto
  ): Promise<BillingScholarship> {
    try {
      // Calculate scholarship amount based on type and value
      const billQuery = await this.supabase
        .from('billing_student_bills')
        .select('total_amount')
        .eq('id', scholarshipData.bill_id)
        .single();

      if (billQuery.error) throw billQuery.error;

      const billAmount = (billQuery.data as { total_amount: number }).total_amount;
      let scholarshipAmount = 0;

      if (scholarshipData.value_mode === 'percentage') {
        scholarshipAmount = (billAmount * scholarshipData.scholarship_value) / 100;
      } else {
        scholarshipAmount = scholarshipData.scholarship_value;
      }

      // Get current user for created_by field
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      const { data, error } = await this.supabase
        .from('billing_scholarships')
        .insert({
          bill_id: scholarshipData.bill_id,
          scholarship_category_id: scholarshipData.scholarship_category_id,
          scholarship_type_id: scholarshipData.scholarship_type_id,
          value_mode: scholarshipData.value_mode,
          scholarship_value: scholarshipData.scholarship_value,
          scholarship_amount: scholarshipAmount,
          scholarship_reason: scholarshipData.scholarship_reason,
          supporting_documents: scholarshipData.supporting_documents,
          effective_date: scholarshipData.effective_date,
          expiry_date: scholarshipData.expiry_date,
          approval_status: 'pending',
          created_by: user?.id
        } as any)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `
        )
        .single();

      if (error) throw error;

      const studentName = `${(data as any)?.bill?.student?.first_name || ''} ${(data as any)?.bill?.student?.last_name || ''}`.trim() || 'Unknown';
      const template = BillingActivityTemplates.scholarshipCreated(
        (data as any)?.scholarship_category?.name ?? 'Scholarship',
        scholarshipAmount,
        studentName
      );
      logActivityForCurrentUser({
        ...template,
        resourceId: (data as any).id,
        metadata: {
          sub_type: template.sub_type,
          bill_id: scholarshipData.bill_id,
          value_mode: scholarshipData.value_mode,
          scholarship_value: scholarshipData.scholarship_value,
          scholarship_amount: scholarshipAmount,
        },
      });

      return data as unknown as BillingScholarship;
    } catch (error) {
      console.error('Error creating scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create scholarship'
      );
    }
  }

  static async updateBillingScholarship(
    id: string,
    scholarshipData: UpdateScholarshipDto
  ): Promise<BillingScholarship> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('billing_scholarships')
        .update(scholarshipData)
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `
        )
        .single();

      if (error) throw error;

      const template = BillingActivityTemplates.scholarshipUpdated(id);
      logActivityForCurrentUser({
        ...template,
        resourceId: id,
        metadata: { sub_type: template.sub_type, updated_fields: Object.keys(scholarshipData) },
      });

      return data as unknown as BillingScholarship;
    } catch (error) {
      console.error('Error updating scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update scholarship'
      );
    }
  }

  static async deleteBillingScholarship(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_scholarships')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const template = BillingActivityTemplates.scholarshipDeleted(id);
      logActivityForCurrentUser({
        ...template,
        resourceId: id,
        metadata: { sub_type: template.sub_type },
      });
    } catch (error) {
      console.error('Error deleting scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete scholarship'
      );
    }
  }

  static async getBillingScholarships(
    filters: ScholarshipFilters = {}
  ): Promise<ScholarshipListResponse> {
    try {
      let query = (this.supabase as any).from('billing_scholarships').select(
        `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `scholarship_reason.ilike.%${filters.search}%,bill.student.first_name.ilike.%${filters.search}%,bill.student.last_name.ilike.%${filters.search}%`
        );
      }

      if (filters.bill_id) {
        query = query.eq('bill_id', filters.bill_id);
      }

      if (filters.scholarship_category_id) {
        query = query.eq('scholarship_category_id', filters.scholarship_category_id);
      }

      if (filters.scholarship_type_id) {
        query = query.eq('scholarship_type_id', filters.scholarship_type_id);
      }

      if (filters.value_mode) {
        query = query.eq('value_mode', filters.value_mode);
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
      console.error('Error fetching scholarships:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch scholarships'
      );
    }
  }

  static async getBillingScholarship(id: string): Promise<BillingScholarship> {
    try {
      const { data, error } = await this.supabase
        .from('billing_scholarships')
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as BillingScholarship;
    } catch (error) {
      console.error('Error fetching scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch scholarship'
      );
    }
  }

  static async approveScholarship(id: string): Promise<BillingScholarship> {
    try {
      // First get the scholarship details to access bill_id and scholarship_amount
      const scholarshipData = await this.getBillingScholarship(id);

      // Get current user
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // Get the current bill details
      const { data: billData, error: billError } = await this.supabase
        .from('billing_student_bills')
        .select('final_amount, balance_amount, status')
        .eq('id', scholarshipData.bill_id)
        .single();

      if (billError) throw billError;

      const billDataTyped = billData as { final_amount: number; balance_amount: number; status: string };

      // Validate that scholarship doesn't exceed bill amount
      if (scholarshipData.scholarship_amount > billDataTyped.final_amount) {
        throw new Error('Scholarship amount cannot exceed bill amount');
      }

      // Check if scholarship is already approved
      if (scholarshipData.approval_status === 'approved') {
        throw new Error('This scholarship is already approved');
      }

      // Calculate new amounts after scholarship
      const newFinalAmount =
        billDataTyped.final_amount - scholarshipData.scholarship_amount;

      // For balance_amount calculation:
      // - If bill is unpaid: balance_amount = new final_amount
      // - If bill is partially_paid: balance_amount = current balance - scholarship_amount (but not less than 0)
      let newBalanceAmount = 0;
      if (billDataTyped.status === 'unpaid') {
        newBalanceAmount = newFinalAmount;
      } else if (billDataTyped.status === 'partially_paid') {
        newBalanceAmount = Math.max(
          0,
          billDataTyped.balance_amount - scholarshipData.scholarship_amount
        );
      }

      // Start a transaction to update both scholarship and bill
      const { data: updatedScholarship, error: scholarshipError } =
        await (this.supabase as any)
          .from('billing_scholarships')
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
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `
          )
          .single();

      if (scholarshipError) throw scholarshipError;

      // Update the bill amounts
      const { error: billUpdateError } = await (this.supabase as any)
        .from('billing_student_bills')
        .update({
          final_amount: newFinalAmount,
          balance_amount: newBalanceAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', scholarshipData.bill_id);

      if (billUpdateError) throw billUpdateError;

      const studentNameApprove = `${scholarshipData.bill?.student?.first_name || ''} ${scholarshipData.bill?.student?.last_name || ''}`.trim() || 'Unknown';
      const templateApprove = BillingActivityTemplates.scholarshipApproved(
        scholarshipData.scholarship_category?.name ?? 'Scholarship',
        scholarshipData.scholarship_amount,
        studentNameApprove
      );
      logActivityForCurrentUser({
        ...templateApprove,
        resourceId: id,
        metadata: {
          sub_type: templateApprove.sub_type,
          bill_id: scholarshipData.bill_id,
          scholarship_amount: scholarshipData.scholarship_amount,
          new_final_amount: newFinalAmount,
          new_balance_amount: newBalanceAmount,
        },
      });

      // If balance becomes 0, mark bill as paid
      if (newBalanceAmount === 0 && billDataTyped.status !== 'paid') {
        const { error: statusUpdateError } = await (this.supabase as any)
          .from('billing_student_bills')
          .update({
            status: 'paid',
            payment_date: new Date().toISOString()
          })
          .eq('id', scholarshipData.bill_id);

        if (statusUpdateError) throw statusUpdateError;
      }

      return updatedScholarship;
    } catch (error) {
      console.error('Error approving scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to approve scholarship'
      );
    }
  }

  static async rejectScholarship(
    id: string,
    reason: string
  ): Promise<BillingScholarship> {
    try {
      // Get current user - this would come from auth context in real implementation
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // First get the current scholarship to access the scholarship_reason
      const currentScholarship = await this.getBillingScholarship(id);

      const { data, error } = await (this.supabase as any)
        .from('billing_scholarships')
        .update({
          approval_status: 'rejected',
          approval_date: new Date().toISOString(),
          authorizer_id: user?.id,
          scholarship_reason: `${currentScholarship.scholarship_reason} (Rejected: ${reason})`
        })
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_student_bills (
            id,
            bill_description,
            total_amount,
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `
        )
        .single();

      if (error) throw error;

      const studentNameReject = `${currentScholarship.bill?.student?.first_name || ''} ${currentScholarship.bill?.student?.last_name || ''}`.trim() || 'Unknown';
      const templateReject = BillingActivityTemplates.scholarshipRejected(
        currentScholarship.scholarship_category?.name ?? 'Scholarship',
        studentNameReject
      );
      logActivityForCurrentUser({
        ...templateReject,
        resourceId: id,
        metadata: { sub_type: templateReject.sub_type, rejection_reason: reason },
      });

      return data;
    } catch (error) {
      console.error('Error rejecting scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to reject scholarship'
      );
    }
  }

  static async reverseScholarship(id: string): Promise<BillingScholarship> {
    try {
      // First get the scholarship details
      const scholarshipData = await this.getBillingScholarship(id);

      if (scholarshipData.approval_status !== 'approved') {
        throw new Error('Can only reverse approved scholarships');
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
        .eq('id', scholarshipData.bill_id)
        .single();

      if (billError) throw billError;

      const billDataTyped = billData as { final_amount: number; balance_amount: number; status: string; total_amount: number; tax_amount: number };

      // Calculate restored amounts (add back the scholarship)
      const restoredFinalAmount =
        billDataTyped.final_amount + scholarshipData.scholarship_amount;

      // For balance_amount calculation, add back the scholarship amount
      const restoredBalanceAmount =
        billDataTyped.balance_amount + scholarshipData.scholarship_amount;

      // Update the scholarship status to 'reversed'
      const { data: updatedScholarship, error: scholarshipError } =
        await (this.supabase as any)
          .from('billing_scholarships')
          .update({
            approval_status: 'rejected', // We'll use rejected status for reversed scholarships
            approval_date: new Date().toISOString(),
            authorizer_id: user?.id,
            scholarship_reason: `${scholarshipData.scholarship_reason} (Reversed by ${
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
            student:learners_profiles (
              id,
              first_name,
              last_name,
              roll_number,
              student_email
            )
          ),
          authorizer:profiles!fk_billing_scholarships_authorizer (
            id,
            full_name
          ),
          scholarship_category:billing_scholarship_categories (
            id,
            name,
            code
          ),
          scholarship_type:billing_scholarship_types (
            id,
            name,
            code
          )
        `
          )
          .single();

      if (scholarshipError) throw scholarshipError;

      // Restore the bill amounts
      const { error: billUpdateError } = await (this.supabase as any)
        .from('billing_student_bills')
        .update({
          final_amount: restoredFinalAmount,
          balance_amount: restoredBalanceAmount,
          status: restoredBalanceAmount > 0 ? 'partially_paid' : 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', scholarshipData.bill_id);

      if (billUpdateError) throw billUpdateError;

      const studentNameReverse = `${scholarshipData.bill?.student?.first_name || ''} ${scholarshipData.bill?.student?.last_name || ''}`.trim() || 'Unknown';
      const templateReverse = BillingActivityTemplates.scholarshipReversed(
        scholarshipData.scholarship_category?.name ?? 'Scholarship',
        scholarshipData.scholarship_amount,
        studentNameReverse
      );
      logActivityForCurrentUser({
        ...templateReverse,
        resourceId: id,
        metadata: {
          sub_type: templateReverse.sub_type,
          bill_id: scholarshipData.bill_id,
          scholarship_amount: scholarshipData.scholarship_amount,
          restored_final_amount: restoredFinalAmount,
          restored_balance_amount: restoredBalanceAmount,
        },
      });

      return updatedScholarship;
    } catch (error) {
      console.error('Error reversing scholarship:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to reverse scholarship'
      );
    }
  }

  static async bulkApplyScholarships(
    scholarships: CreateScholarshipDto[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const scholarshipData of scholarships) {
      try {
        const scholarship = await this.createBillingScholarship(scholarshipData);
        results.success.push(scholarship.id);
      } catch (error) {
        results.failed.push({
          id: scholarshipData.bill_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  // Utility method to get bill with scholarship calculations
  static async getBillWithScholarshipSummary(billId: string): Promise<{
    bill: any;
    scholarships: BillingScholarship[];
    originalAmount: number;
    totalScholarshipAmount: number;
    effectiveAmount: number;
    appliedScholarships: BillingScholarship[];
    pendingScholarships: BillingScholarship[];
  }> {
    try {
      // Get bill details
      const { data: bill, error: billError } = await this.supabase
        .from('billing_student_bills')
        .select('*')
        .eq('id', billId)
        .single();

      if (billError) throw billError;

      // Get all scholarships for this bill
      const { data: scholarships, error: scholarshipError } = await this.supabase
        .from('billing_scholarships')
        .select('*')
        .eq('bill_id', billId)
        .order('created_at', { ascending: false });

      if (scholarshipError) throw scholarshipError;

      const scholarshipsTyped = scholarships as unknown as BillingScholarship[];
      const billTyped = bill as { total_amount: number; tax_amount: number; final_amount: number };

      // Calculate scholarship totals
      const appliedScholarships = scholarshipsTyped.filter(
        (d: any) => d.approval_status === 'approved'
      );
      const pendingScholarships = scholarshipsTyped.filter(
        (d: any) => d.approval_status === 'pending'
      );
      const totalScholarshipAmount = appliedScholarships.reduce(
        (sum: number, d: any) => sum + d.scholarship_amount,
        0
      );

      // Calculate effective amount (this should match bill.final_amount if our logic is correct)
      const originalAmount = billTyped.total_amount + (billTyped.tax_amount || 0);
      const effectiveAmount = originalAmount - totalScholarshipAmount;

      return {
        bill,
        scholarships: scholarshipsTyped as BillingScholarship[],
        originalAmount,
        totalScholarshipAmount,
        effectiveAmount,
        appliedScholarships: appliedScholarships as BillingScholarship[],
        pendingScholarships: pendingScholarships as BillingScholarship[]
      };
    } catch (error) {
      console.error('Error getting bill with scholarship summary:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to get bill scholarship summary'
      );
    }
  }
}
