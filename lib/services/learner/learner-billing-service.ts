import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LearnerBillingDetails,
  LearnerBillingFilters,
  LearnerBillRecord,
  LearnerPaymentRecord,
  LearnerBillingStats,
  PaymentTrend,
  MonthlyBilling,
  CategoryBilling,
  PaymentMethodStats,
  BillingAlert,
  BillingCalendarData,
  LearnerSemesterBilling,
  PaymentRequest,
  PaymentResponse,
  BillingNotification
} from '@/types/learner-billing';

export class LearnerBillingService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get student ID from profile email
   */
  static async getStudentIdFromProfile(email: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('students')
        .select('id')
        .eq('college_email', email)
        .eq('status', 'active')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Error getting student ID from profile:', error);
      return null;
    }
  }

  /**
   * Get student ID from profile ID
   */
  static async getStudentIdFromProfileId(
    profileId: string
  ): Promise<string | null> {
    try {
      // Get user email from profiles table first
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('email')
        .eq('id', profileId)
        .single();

      if (profileError || !profile?.email) {
        throw new Error('Profile not found or email missing');
      }

      return await this.getStudentIdFromProfile(profile.email);
    } catch (error) {
      console.error('Error getting student ID from profile ID:', error);
      return null;
    }
  }

  /**
   * Get comprehensive billing details for a student
   */
  static async getStudentBillingDetails(
    studentId: string,
    filters: LearnerBillingFilters = { view_mode: 'current_semester' }
  ): Promise<LearnerBillingDetails> {
    try {
      // Get student basic details
      const { data: student, error: studentError } = await this.supabase
        .from('students')
        .select(
          `
          id,
          roll_number,
          first_name,
          last_name,
          student_photo_url,
          institution:institutions(id, name),
          academic_year:academic_years(id, academic_year_name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name),
          section:sections(id, section_name)
        `
        )
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;

      // Get bills with filters
      const bills = await this.getStudentBills(studentId, filters);

      // Get payments
      const payments = await this.getStudentPayments(studentId, filters);

      // Get discounts
      const discounts = await this.getStudentDiscounts(studentId, filters);

      // Calculate stats
      const stats = this.calculateBillingStats(bills, payments, discounts);

      // Get semester data
      const semesters = await this.getStudentSemesters(studentId);
      const currentSemester =
        semesters.find((s) => s.is_current) || semesters[0];

      // Get billing calendar
      const calendar = await this.getBillingCalendar(studentId, filters);

      // Get recent transactions
      const recentTransactions = [...bills, ...payments]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 10);

      return {
        student_id: studentId,
        student_name: `${student.first_name} ${student.last_name}`,
        roll_number: student.roll_number,
        student_photo_url: student.student_photo_url,
        program_name: (student.program as any)?.program_name || '',
        department_name: (student.department as any)?.department_name || '',
        semester_name: (student.semester as any)?.semester_name || '',
        section_name: (student.section as any)?.section_name || '',
        academic_year: (student.academic_year as any)?.academic_year_name || '',
        current_semester: currentSemester,
        all_semesters: semesters,
        billing_stats: stats,
        bills,
        payments,
        discounts,
        billing_calendar: calendar,
        recent_transactions: recentTransactions
      };
    } catch (error) {
      console.error('Error fetching student billing details:', error);
      throw new Error('Failed to fetch billing details');
    }
  }

  /**
   * Get student bills with detailed information
   */
  static async getStudentBills(
    studentId: string,
    filters: LearnerBillingFilters
  ): Promise<LearnerBillRecord[]> {
    try {
      let query = this.supabase
        .from('billing_student_bills')
        .select(
          `
          id,
          bill_description,
          due_date,
          quantity,
          unit_amount,
          total_amount,
          tax_amount,
          final_amount,
          balance_amount,
          status,
          payment_date,
          created_at,
          updated_at,
          item_category:billing_item_categories(
            id,
            item_category_name,
            frequency,
            parent_category:billing_parent_categories(id, parent_category_name),
            sub_category:billing_sub_categories(id, sub_category_name)
          )
        `
        )
        .eq('student_id', studentId);

      // Apply filters
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.category_id) {
        query = query.eq('item_category_id', filters.category_id);
      }

      if (filters.date_range) {
        query = query
          .gte('due_date', filters.date_range.from)
          .lte('due_date', filters.date_range.to);
      }

      if (filters.amount_range) {
        query = query
          .gte('final_amount', filters.amount_range.min)
          .lte('final_amount', filters.amount_range.max);
      }

      query = query.order('due_date', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Get payments and discounts for each bill
      const billsWithDetails = await Promise.all(
        (data || []).map(async (bill: any) => {
          const [payments, discounts] = await Promise.all([
            this.getBillPayments(bill.id),
            this.getBillDiscounts(bill.id)
          ]);

          return {
            ...bill,
            payments,
            discounts
          } as LearnerBillRecord;
        })
      );

      return billsWithDetails;
    } catch (error) {
      console.error('Error fetching student bills:', error);
      return [];
    }
  }

  /**
   * Get payments for a specific bill
   */
  static async getBillPayments(
    billId: string
  ): Promise<LearnerPaymentRecord[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_receipt_items')
        .select(
          `
          amount_paid,
          receipt:billing_receipts(
            id,
            receipt_number,
            receipt_date,
            payment_mode,
            payment_amount,
            payment_reference_number,
            payment_remarks,
            payer_name,
            payer_contact,
            created_at
          )
        `
        )
        .eq('bill_id', billId);

      if (error) throw error;

      const payments = (data || []).map((item: any) => ({
        ...item.receipt,
        receipt_items: [
          {
            id: item.id,
            amount_paid: item.amount_paid,
            bill_id: billId
          }
        ]
      }));

      return payments;
    } catch (error) {
      console.error('Error fetching bill payments:', error);
      return [];
    }
  }

  /**
   * Get discounts for a specific bill
   */
  static async getBillDiscounts(billId: string) {
    try {
      const { data, error } = await this.supabase
        .from('billing_discounts')
        .select('*')
        .eq('bill_id', billId)
        .eq('approval_status', 'approved');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching bill discounts:', error);
      return [];
    }
  }

  /**
   * Get student payments
   */
  static async getStudentPayments(
    studentId: string,
    filters: LearnerBillingFilters
  ): Promise<LearnerPaymentRecord[]> {
    try {
      let query = this.supabase
        .from('billing_receipts')
        .select(
          `
          id,
          receipt_number,
          receipt_date,
          payment_mode,
          payment_amount,
          payment_reference_number,
          payment_remarks,
          payer_name,
          payer_contact,
          created_at,
          receipt_items:billing_receipt_items(
            id,
            amount_paid,
            bill_id
          )
        `
        )
        .eq('student_id', studentId);

      if (filters.payment_mode) {
        query = query.eq('payment_mode', filters.payment_mode);
      }

      if (filters.date_range) {
        query = query
          .gte('receipt_date', filters.date_range.from)
          .lte('receipt_date', filters.date_range.to);
      }

      query = query.order('receipt_date', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching student payments:', error);
      return [];
    }
  }

  /**
   * Get student discounts
   */
  static async getStudentDiscounts(
    studentId: string,
    filters: LearnerBillingFilters
  ) {
    try {
      // Get discounts through bills
      const { data, error } = await this.supabase
        .from('billing_discounts')
        .select(
          `
          *,
          bill:billing_student_bills!inner(
            student_id
          )
        `
        )
        .eq('bill.student_id', studentId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching student discounts:', error);
      return [];
    }
  }

  /**
   * Get student semester billing data
   */
  static async getStudentSemesters(
    studentId: string
  ): Promise<LearnerSemesterBilling[]> {
    try {
      // This is a simplified version - in real implementation you'd get actual semester data
      const { data: bills } = await this.supabase
        .from('billing_student_bills')
        .select('final_amount, balance_amount, status, created_at')
        .eq('student_id', studentId);

      // For now, return current semester data
      const totalAmount = (bills || []).reduce(
        (sum, bill) => sum + bill.final_amount,
        0
      );
      const paidAmount =
        totalAmount -
        (bills || []).reduce((sum, bill) => sum + bill.balance_amount, 0);

      return [
        {
          semester_id: '1',
          semester_name: 'Current Semester',
          academic_year: '2024-25',
          start_date: '2024-07-01',
          end_date: '2024-12-31',
          is_current: true,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          outstanding_amount: totalAmount - paidAmount,
          bills_count: bills?.length || 0,
          payment_percentage:
            totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0
        }
      ];
    } catch (error) {
      console.error('Error fetching student semesters:', error);
      return [];
    }
  }

  /**
   * Get billing calendar data
   */
  static async getBillingCalendar(
    studentId: string,
    filters: LearnerBillingFilters
  ): Promise<BillingCalendarData[]> {
    try {
      const [bills, payments] = await Promise.all([
        this.supabase
          .from('billing_student_bills')
          .select('id, due_date, final_amount, bill_description, status')
          .eq('student_id', studentId),
        this.supabase
          .from('billing_receipts')
          .select('id, receipt_date, payment_amount, payer_name')
          .eq('student_id', studentId)
      ]);

      const calendarData: BillingCalendarData[] = [];

      // Add bill due dates
      (bills.data || []).forEach((bill) => {
        calendarData.push({
          date: bill.due_date,
          type: bill.status === 'overdue' ? 'overdue' : 'due_date',
          amount: bill.final_amount,
          description: bill.bill_description,
          status:
            bill.status === 'paid'
              ? 'completed'
              : bill.status === 'overdue'
              ? 'overdue'
              : 'pending',
          bill_id: bill.id
        });
      });

      // Add payment dates
      (payments.data || []).forEach((payment) => {
        calendarData.push({
          date: payment.receipt_date,
          type: 'payment_date',
          amount: payment.payment_amount,
          description: `Payment by ${payment.payer_name}`,
          status: 'completed',
          receipt_id: payment.id
        });
      });

      return calendarData.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (error) {
      console.error('Error fetching billing calendar:', error);
      return [];
    }
  }

  /**
   * Calculate comprehensive billing statistics
   */
  static calculateBillingStats(
    bills: LearnerBillRecord[],
    payments: LearnerPaymentRecord[],
    discounts: any[]
  ): LearnerBillingStats {
    const totalBills = bills.length;
    const paidBills = bills.filter((b) => b.status === 'paid').length;
    const unpaidBills = bills.filter((b) => b.status === 'unpaid').length;
    const overdueBills = bills.filter((b) => b.status === 'overdue').length;

    const totalAmountBilled = bills.reduce(
      (sum, bill) => sum + bill.final_amount,
      0
    );
    const totalAmountPaid = payments.reduce(
      (sum, payment) => sum + payment.payment_amount,
      0
    );
    const outstandingAmount = bills.reduce(
      (sum, bill) => sum + bill.balance_amount,
      0
    );
    const overdueAmount = bills
      .filter((b) => b.status === 'overdue')
      .reduce((sum, bill) => sum + bill.balance_amount, 0);

    const discountAmount = discounts.reduce(
      (sum, discount) => sum + (discount.discount_amount || 0),
      0
    );

    // Calculate trends (simplified)
    const paymentTrends: PaymentTrend[] = [];
    const monthlyBreakdown: MonthlyBilling[] = [];
    const categoryBreakdown: CategoryBilling[] = [];
    const paymentMethodStats: PaymentMethodStats[] = [];

    // Generate alerts
    const alerts: BillingAlert[] = [];
    if (overdueBills > 0) {
      alerts.push({
        id: '1',
        type: 'overdue_payment',
        severity: 'critical',
        title: 'Overdue Payments',
        message: `You have ${overdueBills} overdue bill(s) totaling ₹${overdueAmount.toFixed(
          2
        )}`,
        amount: overdueAmount,
        suggested_action: 'Pay immediately to avoid late fees',
        is_read: false,
        created_at: new Date().toISOString()
      });
    }

    return {
      total_bills: totalBills,
      paid_bills: paidBills,
      unpaid_bills: unpaidBills,
      overdue_bills: overdueBills,
      total_amount_billed: totalAmountBilled,
      total_amount_paid: totalAmountPaid,
      outstanding_amount: outstandingAmount,
      overdue_amount: overdueAmount,
      discount_amount: discountAmount,
      refund_amount: 0,
      payment_trends: paymentTrends,
      monthly_breakdown: monthlyBreakdown,
      category_wise_breakdown: categoryBreakdown,
      payment_method_stats: paymentMethodStats,
      alerts
    };
  }

  /**
   * Get billing notifications for student
   */
  static async getBillingNotifications(
    studentId: string
  ): Promise<BillingNotification[]> {
    try {
      // This would typically come from a notifications table
      // For now, generate based on billing data
      const bills = await this.getStudentBills(studentId, {
        view_mode: 'current_semester'
      });

      const notifications: BillingNotification[] = [];

      // Check for overdue bills
      const overdueBills = bills.filter((b) => b.status === 'overdue');
      if (overdueBills.length > 0) {
        notifications.push({
          id: 'overdue-' + Date.now(),
          type: 'payment_overdue',
          title: 'Payment Overdue',
          message: `${
            overdueBills.length
          } payment(s) are overdue. Total: ₹${overdueBills.reduce(
            (sum, b) => sum + b.balance_amount,
            0
          )}`,
          amount: overdueBills.reduce((sum, b) => sum + b.balance_amount, 0),
          is_read: false,
          priority: 'high',
          action_url: '/learner/billing?filter=overdue',
          created_at: new Date().toISOString()
        });
      }

      return notifications;
    } catch (error) {
      console.error('Error fetching billing notifications:', error);
      return [];
    }
  }

  /**
   * Initiate online payment
   */
  static async initiatePayment(
    studentId: string,
    paymentRequest: PaymentRequest
  ): Promise<PaymentResponse> {
    try {
      // This would integrate with payment gateway
      // For now, return mock response
      return {
        payment_id: 'pay_' + Date.now(),
        payment_url: 'https://gateway.example.com/pay/...',
        status: 'initiated',
        amount: paymentRequest.amount,
        currency: 'INR',
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error initiating payment:', error);
      throw new Error('Failed to initiate payment');
    }
  }

  /**
   * Get payment methods available for student
   */
  static async getAvailablePaymentMethods(studentId: string) {
    return [
      {
        id: 'upi',
        name: 'UPI',
        icon: '📱',
        enabled: true,
        processing_fee: 0
      },
      {
        id: 'netbanking',
        name: 'Net Banking',
        icon: '🏦',
        enabled: true,
        processing_fee: 5
      },
      {
        id: 'card',
        name: 'Credit/Debit Card',
        icon: '💳',
        enabled: true,
        processing_fee: 10
      },
      {
        id: 'wallet',
        name: 'Digital Wallet',
        icon: '👛',
        enabled: true,
        processing_fee: 0
      }
    ];
  }

  /**
   * Request payment plan for outstanding bills
   */
  static async requestPaymentPlan(
    studentId: string,
    billIds: string[],
    proposedPlan: {
      installments: number;
      monthly_amount: number;
      start_date: string;
      reason: string;
    }
  ) {
    try {
      // This would create a payment plan request
      console.log('Payment plan requested:', {
        studentId,
        billIds,
        proposedPlan
      });

      return {
        success: true,
        plan_id: 'plan_' + Date.now(),
        status: 'pending_approval',
        message:
          'Payment plan request submitted successfully. You will be notified once approved.'
      };
    } catch (error) {
      console.error('Error requesting payment plan:', error);
      throw new Error('Failed to request payment plan');
    }
  }
}
