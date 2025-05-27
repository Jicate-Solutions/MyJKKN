import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StudentBill,
  CreateStudentBillDto,
  UpdateStudentBillDto,
  StudentBillFilters,
  StudentBillListResponse,
  BulkBillScheduleDto,
  BulkOperationResult
} from '@/types/billing-schedule';

export class StudentBillService {
  private static supabase = createClientSupabaseClient();

  static async createStudentBill(
    billData: CreateStudentBillDto
  ): Promise<StudentBill> {
    try {
      // Calculate final amount if not provided
      const finalAmount =
        billData.final_amount ||
        billData.total_amount + (billData.tax_amount || 0);

      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .insert({
          ...billData,
          final_amount: finalAmount,
          balance_amount: finalAmount,
          quantity: billData.quantity || 1,
          tax_amount: billData.tax_amount || 0
        })
        .select(
          `
          *,
          student:students(
            id,
            student_name,
            roll_number,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          )
        `
        )
        .single();

      if (error) throw error;

      // Handle recurring bills
      if (
        billData.is_recurring &&
        billData.number_of_recurrences &&
        billData.recurrence_pattern
      ) {
        await this.createRecurringBills(data, billData);
      }

      return data;
    } catch (error) {
      console.error('Error creating student bill:', error);
      throw error;
    }
  }

  static async updateStudentBill(
    id: string,
    billData: UpdateStudentBillDto
  ): Promise<StudentBill> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .update(billData)
        .eq('id', id)
        .select(
          `
          *,
          student:students(
            id,
            student_name,
            roll_number,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          )
        `
        )
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating student bill:', error);
      throw error;
    }
  }

  static async deleteStudentBill(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_student_bills')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting student bill:', error);
      throw error;
    }
  }

  static async bulkDeleteStudentBills(
    ids: string[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const id of ids) {
      try {
        await this.deleteStudentBill(id);
        results.success.push(id);
      } catch (error) {
        results.failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  static async getStudentBills(
    filters: StudentBillFilters = {}
  ): Promise<StudentBillListResponse> {
    try {
      let query = this.supabase.from('billing_student_bills').select(
        `
          *,
          student:students(
            id,
            student_name,
            roll_number,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `bill_description.ilike.%${filters.search}%,student.student_name.ilike.%${filters.search}%,student.roll_number.ilike.%${filters.search}%`
        );
      }

      if (filters.student_id) {
        query = query.eq('student_id', filters.student_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.item_category_id) {
        query = query.eq('item_category_id', filters.item_category_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.due_date_from) {
        query = query.gte('due_date', filters.due_date_from);
      }

      if (filters.due_date_to) {
        query = query.lte('due_date', filters.due_date_to);
      }

      if (filters.amount_from) {
        query = query.gte('final_amount', filters.amount_from);
      }

      if (filters.amount_to) {
        query = query.lte('final_amount', filters.amount_to);
      }

      if (filters.is_recurring !== undefined) {
        query = query.eq('is_recurring', filters.is_recurring);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

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
      console.error('Error fetching student bills:', error);
      throw error;
    }
  }

  static async getStudentBill(id: string): Promise<StudentBill> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          student:students(
            id,
            student_name,
            roll_number,
            student_email,
            student_mobile
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          ),
          discounts:billing_discounts(*),
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching student bill:', error);
      throw error;
    }
  }

  static async getStudentBillsByStudent(
    studentId: string,
    status?: string
  ): Promise<StudentBill[]> {
    try {
      let query = this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          ),
          discounts:billing_discounts(*),
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('student_id', studentId)
        .order('due_date', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching student bills by student:', error);
      throw error;
    }
  }

  static async bulkCreateStudentBills(
    bulkData: BulkBillScheduleDto
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const studentId of bulkData.student_ids) {
      for (const billData of bulkData.bills) {
        try {
          await this.createStudentBill({
            ...billData,
            student_id: studentId
          });
          results.success.push(studentId);
        } catch (error) {
          results.failed.push({
            id: studentId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return results;
  }

  static async markOverdueBills(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('mark_overdue_bills');

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error marking overdue bills:', error);
      throw error;
    }
  }

  static async calculateStudentOutstanding(studentId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc(
        'calculate_student_outstanding',
        { student_uuid: studentId }
      );

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculating student outstanding:', error);
      throw error;
    }
  }

  private static async createRecurringBills(
    originalBill: StudentBill,
    billData: CreateStudentBillDto
  ): Promise<void> {
    if (!billData.number_of_recurrences || !billData.recurrence_pattern) return;

    const recurringBills = [];
    const originalDueDate = new Date(originalBill.due_date);

    for (let i = 1; i < billData.number_of_recurrences; i++) {
      const newDueDate = new Date(originalDueDate);

      switch (billData.recurrence_pattern) {
        case 'monthly':
          newDueDate.setMonth(newDueDate.getMonth() + i);
          break;
        case 'quarterly':
          newDueDate.setMonth(newDueDate.getMonth() + i * 3);
          break;
        case 'yearly':
          newDueDate.setFullYear(newDueDate.getFullYear() + i);
          break;
      }

      recurringBills.push({
        ...billData,
        due_date: newDueDate.toISOString().split('T')[0],
        bill_description: `${billData.bill_description} (${i + 1}/${
          billData.number_of_recurrences
        })`,
        is_recurring: false, // Prevent infinite recursion
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      });
    }

    if (recurringBills.length > 0) {
      const { error } = await this.supabase
        .from('billing_student_bills')
        .insert(recurringBills);

      if (error) throw error;
    }
  }

  static async getUnpaidBillsByStudent(
    studentId: string
  ): Promise<StudentBill[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          )
        `
        )
        .eq('student_id', studentId)
        .in('status', ['unpaid', 'partially_paid', 'overdue'])
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching unpaid bills:', error);
      throw error;
    }
  }

  static async updateBillStatus(
    billId: string,
    status: string,
    balanceAmount?: number
  ): Promise<void> {
    try {
      const updateData: any = { status };

      if (status === 'paid') {
        updateData.balance_amount = 0;
        updateData.payment_date = new Date().toISOString();
      } else if (status === 'partially_paid' && balanceAmount !== undefined) {
        updateData.balance_amount = balanceAmount;
      } else if (status === 'unpaid' && balanceAmount !== undefined) {
        updateData.balance_amount = balanceAmount;
        updateData.payment_date = null; // Clear payment date if bill becomes unpaid due to refund
      }

      const { error } = await this.supabase
        .from('billing_student_bills')
        .update(updateData)
        .eq('id', billId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating bill status:', error);
      throw error;
    }
  }

  // Method to update bill balance after refund
  static async updateBillBalanceAfterRefund(
    billId: string,
    refundAmount: number
  ): Promise<void> {
    try {
      // First get the current bill details
      const bill = await this.getStudentBill(billId);

      // Calculate new balance (add refund amount back to balance)
      const newBalance = bill.balance_amount + refundAmount;

      // Determine new status based on balance
      let newStatus = bill.status;
      if (newBalance >= bill.final_amount) {
        newStatus = 'unpaid';
      } else if (newBalance > 0) {
        newStatus = 'partially_paid';
      } else {
        newStatus = 'paid';
      }

      // Update the bill
      await this.updateBillStatus(billId, newStatus, newBalance);
    } catch (error) {
      console.error('Error updating bill balance after refund:', error);
      throw error;
    }
  }

  // Method to get refunds for a specific bill
  static async getBillRefunds(billId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_refunds')
        .select(
          `
          *,
          receipt:billing_receipts!inner(
            id,
            receipt_number,
            receipt_items:billing_receipt_items!inner(
              bill_id
            )
          )
        `
        )
        .eq('receipt.receipt_items.bill_id', billId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching bill refunds:', error);
      throw error;
    }
  }

  // Method to calculate total refunded amount for a bill
  static async getBillTotalRefundAmount(billId: string): Promise<number> {
    try {
      const refunds = await this.getBillRefunds(billId);
      return refunds
        .filter(
          (refund) =>
            refund.approval_status === 'approved' ||
            refund.approval_status === 'processed'
        )
        .reduce((total, refund) => total + refund.refund_amount, 0);
    } catch (error) {
      console.error('Error calculating total refund amount:', error);
      return 0;
    }
  }
}
