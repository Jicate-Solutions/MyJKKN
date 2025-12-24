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
      // Get current user ID
      const { data: userData } = await (this.supabase as any).auth.getUser();
      const currentUserId = userData?.user?.id;

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
          tax_amount: billData.tax_amount || 0,
          created_by: currentUserId
        })
        .select(
          `
          *,
          student:students(
            id,
            first_name,
            last_name,
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
      // First get the current bill to calculate proper balance_amount
      const currentBill = await this.getStudentBill(id);

      // Calculate final amount if any amount fields are being updated
      let finalAmount = billData.final_amount;
      if (
        !finalAmount &&
        (billData.total_amount !== undefined ||
          billData.tax_amount !== undefined)
      ) {
        const totalAmount = billData.total_amount ?? currentBill.total_amount;
        const taxAmount = billData.tax_amount ?? currentBill.tax_amount;
        finalAmount = totalAmount + taxAmount;
      }

      // Calculate the proper balance_amount based on payments made
      let balanceAmount = billData.balance_amount;
      if (finalAmount !== undefined) {
        // Get total payments for this bill
        const { data: receiptItems } = await this.supabase
          .from('billing_receipt_items')
          .select('amount_paid')
          .eq('bill_id', id);

        const totalPaid =
          receiptItems?.reduce((sum, item) => sum + item.amount_paid, 0) || 0;

        // Get total processed refunds for this bill
        let totalRefunded = 0;
        if (receiptItems && receiptItems.length > 0) {
          const { data: receiptIdData } = await this.supabase
            .from('billing_receipt_items')
            .select('receipt_id')
            .eq('bill_id', id);

          const receiptIdList =
            receiptIdData?.map((item) => item.receipt_id) || [];

          if (receiptIdList.length > 0) {
            const { data: refundData } = await this.supabase
              .from('billing_refunds')
              .select('refund_amount')
              .in('receipt_id', receiptIdList)
              .eq('approval_status', 'processed');

            totalRefunded =
              refundData?.reduce(
                (sum, refund) => sum + refund.refund_amount,
                0
              ) || 0;
          }
        }

        // Calculate net paid amount
        const netPaid = totalPaid - totalRefunded;

        // Calculate new balance
        balanceAmount = Math.max(0, finalAmount - netPaid);

        // Update status if needed
        if (!billData.status) {
          if (netPaid >= finalAmount) {
            billData.status = 'paid';
          } else if (netPaid > 0) {
            billData.status = 'partially_paid';
          } else {
            billData.status = 'unpaid';
          }
        }
      }

      // Prepare update data
      const updateData = {
        ...billData,
        ...(finalAmount !== undefined && { final_amount: finalAmount }),
        ...(balanceAmount !== undefined && { balance_amount: balanceAmount })
      };

      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .update(updateData)
        .eq('id', id)
        .select(
          `
          *,
          student:students(
            id,
            first_name,
            last_name,
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
      // Check if any academic hierarchy filters are provided
      const hasAcademicFilters = !!(
        filters.academic_year_id ||
        filters.degree_id ||
        filters.department_id ||
        filters.program_id ||
        filters.semester_id ||
        filters.section_id
      );

      let query;

      if (hasAcademicFilters) {
        // Use the billing_student_bills table with joins when academic filters are needed
        query = (this.supabase as any).from('billing_student_bills').select(
          `
            id,
            student_id,
            institution_id,
            item_category_id,
            bill_description,
            due_date,
            quantity,
            unit_amount,
            total_amount,
            tax_amount,
            final_amount,
            status,
            payment_date,
            balance_amount,
            remarks,
            is_recurring,
            recurrence_pattern,
            number_of_recurrences,
            created_by,
            created_at,
            updated_at,
            student:students(
              first_name,
              last_name,
              roll_number,
              academic_year_id,
              degree_id,
              department_id,
              program_id,
              semester_id,
              section_id,
              department:departments(id, department_name),
              semester:semesters(id, semester_name)
            ),
            institution:institutions(
              id,
              name
            ),
            item_category:billing_item_categories(
              id,
              item_category_name
            )
          `,
          { count: 'exact' }
        );
      } else {
        // Use the optimized view that pre-joins all data when no academic filters are needed
        // Note: For now, let's use the full query to ensure we get all necessary data
        query = (this.supabase as any).from('billing_student_bills').select(
          `
            id,
            student_id,
            institution_id,
            item_category_id,
            bill_description,
            due_date,
            quantity,
            unit_amount,
            total_amount,
            tax_amount,
            final_amount,
            status,
            payment_date,
            balance_amount,
            remarks,
            is_recurring,
            recurrence_pattern,
            number_of_recurrences,
            created_by,
            created_at,
            updated_at,
            student:students(
              first_name,
              last_name,
              roll_number,
              department:departments(id, department_name),
              semester:semesters(id, semester_name)
            ),
            institution:institutions(
              id,
              name
            ),
            item_category:billing_item_categories(
              id,
              item_category_name
            )
          `,
          { count: 'exact' }
        );
      }

      // Apply search filter with correct syntax
      if (filters.search) {
        const searchTerm = `*${filters.search}*`;

        if (hasAcademicFilters) {
          // When using joins, student fields are nested
          query = query.or(
            `bill_description.ilike.${searchTerm},student.first_name.ilike.${searchTerm},student.last_name.ilike.${searchTerm},student.roll_number.ilike.${searchTerm}`
          );
        } else {
          // When using the view, fields are flattened
          query = query.or(
            `bill_description.ilike.${searchTerm},student_name.ilike.${searchTerm},roll_number.ilike.${searchTerm}`
          );
        }
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

      // Apply academic hierarchy filters (only when using the joined query)
      if (hasAcademicFilters) {
        if (filters.academic_year_id) {
          query = query.eq(
            'student.academic_year_id',
            filters.academic_year_id
          );
        }

        if (filters.degree_id) {
          query = query.eq('student.degree_id', filters.degree_id);
        }

        if (filters.department_id) {
          query = query.eq('student.department_id', filters.department_id);
        }

        if (filters.program_id) {
          query = query.eq('student.program_id', filters.program_id);
        }

        if (filters.semester_id) {
          query = query.eq('student.semester_id', filters.semester_id);
        }

        if (filters.section_id) {
          query = query.eq('student.section_id', filters.section_id);
        }
      }

      // Apply sorting with proper column mapping
      let sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';

      // Map sort columns based on query type
      if (!hasAcademicFilters) {
        // When using view, map student fields appropriately
        if (
          sortBy === 'first_name' ||
          sortBy === 'last_name' ||
          sortBy === 'student_name'
        ) {
          sortBy = 'student_name';
        } else if (
          sortBy === 'student.first_name' ||
          sortBy === 'student.last_name'
        ) {
          sortBy = 'student_name';
        } else if (sortBy === 'student' || sortBy === 'student.name') {
          sortBy = 'student_name';
        }
      }

      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Transform data based on the query type
      const transformedData = (data || []).map((bill: any): StudentBill => {
        // Common core bill fields
        const baseBill = {
          id: bill.id,
          student_id: bill.student_id,
          institution_id: bill.institution_id,
          item_category_id: bill.item_category_id,
          bill_description: bill.bill_description,
          due_date: bill.due_date,
          quantity: bill.quantity,
          unit_amount: bill.unit_amount,
          total_amount: bill.total_amount,
          tax_amount: bill.tax_amount,
          final_amount: bill.final_amount,
          status: bill.status,
          payment_date: bill.payment_date,
          balance_amount: bill.balance_amount,
          remarks: bill.remarks,
          is_recurring: bill.is_recurring,
          recurrence_pattern: bill.recurrence_pattern,
          number_of_recurrences: bill.number_of_recurrences,
          created_by: bill.created_by,
          created_at: bill.created_at,
          updated_at: bill.updated_at
        };

        // Since we're now using the same query structure for both cases,
        // we can simplify the transformation logic
        const studentData = Array.isArray(bill.student)
          ? bill.student[0]
          : bill.student;
        const institutionData = Array.isArray(bill.institution)
          ? bill.institution[0]
          : bill.institution;
        const itemCategoryData = Array.isArray(bill.item_category)
          ? bill.item_category[0]
          : bill.item_category;

        return {
          ...baseBill,
          student: {
            id: bill.student_id,
            first_name: studentData?.first_name || '',
            last_name: studentData?.last_name || '',
            roll_number: studentData?.roll_number || '',
            college_email: '', // Not queried to keep it light
            student_mobile: '', // Not queried to keep it light
            department: studentData?.department || undefined,
            semester: studentData?.semester || undefined
          },
          institution: {
            id: bill.institution_id,
            name: institutionData?.name || '',
            counselling_code: '' // Not queried to keep it light
          },
          item_category: {
            id: bill.item_category_id,
            item_category_name: itemCategoryData?.item_category_name || ''
          }
        };
      });

      return {
        data: transformedData,
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
            first_name,
            last_name,
            roll_number,
            college_email,
            student_mobile,
            degree:degrees(id, degree_name),
            department:departments(id, department_name),
            semester:semesters(id, semester_name)
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
          discounts:billing_discounts(
            *,
            authorizer:profiles(id, full_name)
          ),
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(
              *,
              student:students(id, first_name, last_name, college_email),
              accountant:profiles(id, full_name),
              refunds:billing_refunds(
                *,
                authorizer:profiles!fk_billing_refunds_authorizer(id, full_name),
                approver:profiles!fk_billing_refunds_approved_by(id, full_name)
              )
            )
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
      const { data, error } = await (this.supabase as any).rpc('mark_overdue_bills');

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error marking overdue bills:', error);
      throw error;
    }
  }

  static async calculateStudentOutstanding(studentId: string): Promise<number> {
    try {
      // Use the optimized function with fallback
      const { data, error } = await (this.supabase as any).rpc(
        'calculate_student_outstanding_optimized',
        { student_uuid: studentId }
      );

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculating student outstanding:', error);

      // Fallback: calculate from bill balances directly
      try {
        const { data: bills } = await this.supabase
          .from('billing_student_bills')
          .select('balance_amount')
          .eq('student_id', studentId)
          .in('status', ['unpaid', 'partially_paid', 'overdue']);

        return (
          bills?.reduce((sum, bill) => sum + (bill.balance_amount || 0), 0) || 0
        );
      } catch (fallbackError) {
        console.error('Error in fallback calculation:', fallbackError);
        return 0;
      }
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
