import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StudentForBilling,
  StudentForBillingListResponse,
  StudentSearchFilters,
  StudentBillingSummary
} from '@/types/billing-schedule';

// Helper type for raw Supabase response
type RawStudentData = {
  id: string;
  roll_number: string;
  student_name: string;
  father_name: string;
  student_mobile: string;
  student_email: string;
  institution_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  institution?: any;
  department?: any;
  program?: any;
  semester?: any;
};

export class StudentSearchService {
  private static supabase = createClientSupabaseClient();

  // Helper function to map raw data to StudentForBilling
  private static mapToStudentForBilling(
    rawData: RawStudentData,
    outstandingAmount: number
  ): StudentForBilling {
    return {
      id: rawData.id,
      roll_number: rawData.roll_number,
      student_name: rawData.student_name,
      father_name: rawData.father_name,
      student_mobile: rawData.student_mobile,
      student_email: rawData.student_email,
      institution_id: rawData.institution_id,
      department_id: rawData.department_id,
      program_id: rawData.program_id,
      semester_id: rawData.semester_id,
      institution: rawData.institution || {
        id: rawData.institution_id,
        name: ''
      },
      department: rawData.department || {
        id: rawData.department_id,
        department_name: ''
      },
      program: rawData.program || { id: rawData.program_id, program_name: '' },
      semester: rawData.semester || {
        id: rawData.semester_id,
        semester_name: ''
      },
      outstanding_amount: outstandingAmount
    };
  }

  static async searchStudentsForBilling(
    filters: StudentSearchFilters = {}
  ): Promise<StudentForBillingListResponse> {
    try {
      let query = this.supabase
        .from('students')
        .select(
          `
          id,
          roll_number,
          student_name,
          father_name,
          student_mobile,
          student_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          institution:institutions(id, name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        `,
          { count: 'exact' }
        )
        .eq('status', 'active')
        .eq('is_profile_complete', true);

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      if (filters.student_name) {
        query = query.ilike('student_name', `%${filters.student_name}%`);
      }

      if (filters.roll_number) {
        query = query.ilike('roll_number', `%${filters.roll_number}%`);
      }

      if (filters.mobile_number) {
        query = query.ilike('student_mobile', `%${filters.mobile_number}%`);
      }

      // Apply sorting
      query = query.order('student_name', { ascending: true });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Calculate outstanding amounts for each student and properly type the data
      const studentsWithOutstanding: StudentForBilling[] = await Promise.all(
        (data || []).map(async (student: any) => {
          const outstandingAmount = await this.calculateStudentOutstanding(
            student.id
          );
          return this.mapToStudentForBilling(student, outstandingAmount);
        })
      );

      return {
        data: studentsWithOutstanding,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error searching students for billing:', error);
      throw error;
    }
  }

  static async getStudentForBilling(
    studentId: string
  ): Promise<StudentForBilling> {
    try {
      const { data, error } = await this.supabase
        .from('students')
        .select(
          `
          id,
          roll_number,
          student_name,
          father_name,
          student_mobile,
          student_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          institution:institutions(id, name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        `
        )
        .eq('id', studentId)
        .eq('status', 'active')
        .single();

      if (error) throw error;

      const outstandingAmount = await this.calculateStudentOutstanding(
        studentId
      );
      return this.mapToStudentForBilling(data, outstandingAmount);
    } catch (error) {
      console.error('Error fetching student for billing:', error);
      throw error;
    }
  }

  static async getStudentBillingSummary(
    studentId: string
  ): Promise<StudentBillingSummary> {
    try {
      // Get student details
      const student = await this.getStudentForBilling(studentId);

      // Get all bills for the student
      const { data: bills, error: billsError } = await this.supabase
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
          receipt_items:billing_receipt_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('student_id', studentId)
        .order('due_date', { ascending: false });

      if (billsError) throw billsError;

      // Get all receipts for the student
      const { data: receipts, error: receiptsError } = await this.supabase
        .from('billing_receipts')
        .select(
          `
          *,
          receipt_items:billing_receipt_items(
            *,
            bill:billing_student_bills(*)
          ),
          refunds:billing_refunds(*)
        `
        )
        .eq('student_id', studentId)
        .order('receipt_date', { ascending: false });

      if (receiptsError) throw receiptsError;

      // Get all discounts for the student's bills
      const billIds = bills?.map((bill) => bill.id) || [];
      let discounts: any[] = [];
      if (billIds.length > 0) {
        const { data: discountData, error: discountsError } =
          await this.supabase
            .from('billing_discounts')
            .select(
              `
            *,
            bill:billing_student_bills(*)
          `
            )
            .in('bill_id', billIds)
            .order('created_at', { ascending: false });

        if (discountsError) throw discountsError;
        discounts = discountData || [];
      }

      // Get all refunds for the student's receipts
      const receiptIds = receipts?.map((receipt) => receipt.id) || [];
      let refunds: any[] = [];
      if (receiptIds.length > 0) {
        const { data: refundData, error: refundsError } = await this.supabase
          .from('billing_refunds')
          .select(
            `
            *,
            receipt:billing_receipts(*)
          `
          )
          .in('receipt_id', receiptIds)
          .order('created_at', { ascending: false });

        if (refundsError) throw refundsError;
        refunds = refundData || [];
      }

      // Get all invoices for the student
      const { data: invoices, error: invoicesError } = await this.supabase
        .from('billing_invoices')
        .select(
          `
          *,
          invoice_items:billing_invoice_items(
            *,
            receipt:billing_receipts(*)
          )
        `
        )
        .eq('student_id', studentId)
        .order('invoice_date', { ascending: false });

      if (invoicesError) throw invoicesError;

      // Calculate summary
      const totalBills = bills?.length || 0;
      const paidAmount =
        receipts?.reduce((sum, receipt) => sum + receipt.payment_amount, 0) ||
        0;
      const outstandingAmount = student.outstanding_amount;
      const overdueAmount =
        bills
          ?.filter((bill) => bill.status === 'overdue')
          .reduce((sum, bill) => sum + bill.balance_amount, 0) || 0;
      const discountAmount =
        discounts?.reduce(
          (sum, discount) => sum + discount.discount_amount,
          0
        ) || 0;
      const refundAmount =
        refunds?.reduce((sum, refund) => sum + refund.net_refund_amount, 0) ||
        0;

      return {
        student,
        bills: bills || [],
        receipts: receipts || [],
        discounts,
        refunds,
        invoices: invoices || [],
        summary: {
          total_bills: totalBills,
          paid_amount: paidAmount,
          outstanding_amount: outstandingAmount,
          overdue_amount: overdueAmount,
          discount_amount: discountAmount,
          refund_amount: refundAmount
        }
      };
    } catch (error) {
      console.error('Error fetching student billing summary:', error);
      throw error;
    }
  }

  private static async calculateStudentOutstanding(
    studentId: string
  ): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc(
        'calculate_student_outstanding',
        { student_uuid: studentId }
      );

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculating student outstanding:', error);
      return 0; // Return 0 if calculation fails
    }
  }

  static async getStudentsByInstitution(
    institutionId: string,
    limit: number = 50
  ): Promise<StudentForBilling[]> {
    try {
      const { data, error } = await this.supabase
        .from('students')
        .select(
          `
          id,
          roll_number,
          student_name,
          father_name,
          student_mobile,
          student_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .order('student_name', { ascending: true })
        .limit(limit);

      if (error) throw error;

      // Calculate outstanding amounts for each student and properly type the data
      const studentsWithOutstanding: StudentForBilling[] = await Promise.all(
        (data || []).map(async (student: any) => {
          const outstandingAmount = await this.calculateStudentOutstanding(
            student.id
          );
          return this.mapToStudentForBilling(student, outstandingAmount);
        })
      );

      return studentsWithOutstanding;
    } catch (error) {
      console.error('Error fetching students by institution:', error);
      throw error;
    }
  }

  static async getStudentsWithOutstandingBills(
    institutionId?: string,
    limit: number = 50
  ): Promise<StudentForBilling[]> {
    try {
      let query = this.supabase
        .from('students')
        .select(
          `
          id,
          roll_number,
          student_name,
          father_name,
          student_mobile,
          student_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          institution:institutions(id, name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name)
        `
        )
        .eq('status', 'active');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      query = query.order('student_name', { ascending: true }).limit(limit);

      const { data, error } = await query;

      if (error) throw error;

      // Filter students with outstanding bills and calculate amounts
      const studentsWithOutstanding: StudentForBilling[] = [];
      for (const student of data || []) {
        const outstandingAmount = await this.calculateStudentOutstanding(
          student.id
        );
        if (outstandingAmount > 0) {
          studentsWithOutstanding.push(
            this.mapToStudentForBilling(student, outstandingAmount)
          );
        }
      }

      return studentsWithOutstanding;
    } catch (error) {
      console.error('Error fetching students with outstanding bills:', error);
      throw error;
    }
  }

  static async searchStudentsByQuery(
    searchQuery: string,
    institutionId?: string,
    limit: number = 20
  ): Promise<StudentForBilling[]> {
    try {
      let query = this.supabase
        .from('students')
        .select(
          `
          id,
          roll_number,
          student_name,
          father_name,
          student_mobile,
          student_email,
          institution_id,
          department_id,
          program_id,
          semester_id,
          institution:institutions(id, name),
          department:departments(id, department_name)
        `
        )
        .eq('status', 'active');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Search across multiple fields
      query = query.or(
        `student_name.ilike.%${searchQuery}%,roll_number.ilike.%${searchQuery}%,student_mobile.ilike.%${searchQuery}%,student_email.ilike.%${searchQuery}%`
      );

      query = query.order('student_name', { ascending: true }).limit(limit);

      const { data, error } = await query;

      if (error) throw error;

      // Calculate outstanding amounts for each student and properly type the data
      const studentsWithOutstanding: StudentForBilling[] = await Promise.all(
        (data || []).map(async (student: any) => {
          const outstandingAmount = await this.calculateStudentOutstanding(
            student.id
          );
          return this.mapToStudentForBilling(student, outstandingAmount);
        })
      );

      return studentsWithOutstanding;
    } catch (error) {
      console.error('Error searching students by query:', error);
      throw error;
    }
  }
}
