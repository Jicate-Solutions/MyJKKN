import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingReportFilters,
  TransactionSummary,
  OutstandingReport,
  CollectionReport,
  DiscountReport,
  RefundReport,
  InvoiceReport,
  BillingDashboardMetrics,
  ReportExportOptions
} from '@/types/billing-schedule';

export class BillingReportService {
  private static supabase = createClientSupabaseClient();

  // Get dashboard metrics
  static async getDashboardMetrics(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<BillingDashboardMetrics> {
    try {
      // Build date filters
      const dateFilter = {
        start:
          dateFrom ||
          new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        end: dateTo || new Date().toISOString().split('T')[0]
      };

      // Get basic metrics
      const metricsPromises = [
        this.getTotalStudents(institutionId),
        this.getTotalBills(institutionId, dateFilter.start, dateFilter.end),
        this.getTotalAmountBilled(
          institutionId,
          dateFilter.start,
          dateFilter.end
        ),
        this.getTotalAmountCollected(
          institutionId,
          dateFilter.start,
          dateFilter.end
        ),
        this.getTotalOutstanding(institutionId),
        this.getTotalOverdue(institutionId),
        this.getRecentTransactions(institutionId, 10),
        this.getMonthlyCollection(
          institutionId,
          dateFilter.start,
          dateFilter.end
        ),
        this.getInstitutionWiseSummary(institutionId)
      ];

      const [
        totalStudents,
        totalBills,
        totalAmountBilled,
        totalAmountCollected,
        totalOutstanding,
        totalOverdue,
        recentTransactions,
        monthlyCollection,
        institutionWiseSummary
      ] = await Promise.all(metricsPromises);

      const collectionRate =
        totalAmountBilled > 0
          ? (totalAmountCollected / totalAmountBilled) * 100
          : 0;

      return {
        total_students: totalStudents,
        total_bills: totalBills,
        total_amount_billed: totalAmountBilled,
        total_amount_collected: totalAmountCollected,
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
        collection_rate: Math.round(collectionRate * 100) / 100,
        recent_transactions: recentTransactions,
        monthly_collection: monthlyCollection,
        institution_wise_summary: institutionWiseSummary
      };
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      throw new Error('Failed to fetch dashboard metrics');
    }
  }

  // Get transaction summary
  static async getTransactionSummary(
    filters: BillingReportFilters = {}
  ): Promise<TransactionSummary> {
    try {
      const [
        totalBills,
        totalReceipts,
        totalAmountBilled,
        totalAmountCollected,
        totalOutstanding,
        totalOverdue,
        totalDiscounts,
        totalRefunds
      ] = await Promise.all([
        this.getTotalBills(
          filters.institution_id,
          filters.date_from,
          filters.date_to
        ),
        this.getTotalReceipts(
          filters.institution_id,
          filters.date_from,
          filters.date_to
        ),
        this.getTotalAmountBilled(
          filters.institution_id,
          filters.date_from,
          filters.date_to
        ),
        this.getTotalAmountCollected(
          filters.institution_id,
          filters.date_from,
          filters.date_to
        ),
        this.getTotalOutstanding(filters.institution_id),
        this.getTotalOverdue(filters.institution_id),
        this.getTotalDiscounts(
          filters.institution_id,
          filters.date_from,
          filters.date_to
        ),
        this.getTotalRefunds(
          filters.institution_id,
          filters.date_from,
          filters.date_to
        )
      ]);

      return {
        total_bills: totalBills,
        total_receipts: totalReceipts,
        total_amount_billed: totalAmountBilled,
        total_amount_collected: totalAmountCollected,
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
        total_discounts: totalDiscounts,
        total_refunds: totalRefunds
      };
    } catch (error) {
      console.error('Error fetching transaction summary:', error);
      throw new Error('Failed to fetch transaction summary');
    }
  }

  // Get outstanding report
  static async getOutstandingReport(
    filters: BillingReportFilters = {}
  ): Promise<OutstandingReport[]> {
    try {
      let query = this.supabase
        .from('billing_student_bills')
        .select(
          `
          student_id,
          students(
            first_name,
            last_name,
            roll_number,
            institution:institutions(name),
            department:departments(department_name)
          ),
          id,
          bill_description,
          due_date,
          final_amount,
          status,
          balance_amount
        `
        )
        .in('status', ['unpaid', 'partially_paid', 'overdue']);

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.student_id) {
        query = query.eq('student_id', filters.student_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching outstanding report:', error);
        throw new Error(`Failed to fetch outstanding report: ${error.message}`);
      }

      // Group by student
      const studentMap = new Map<string, OutstandingReport>();

      data?.forEach((bill: any) => {
        const studentId = bill.student_id;
        const billAmount =
          bill.status === 'partially_paid'
            ? bill.balance_amount
            : bill.final_amount;
        const isOverdue =
          new Date(bill.due_date) < new Date() && bill.status !== 'paid';

        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            student_id: studentId,
            first_name: bill.students?.first_name || '',
          last_name: bill.students?.last_name || '',
            roll_number: bill.students?.roll_number,
            institution_name: bill.students?.institution?.name || '',
            department_name: bill.students?.department?.department_name,
            total_outstanding: 0,
            overdue_amount: 0,
            bills: []
          });
        }

        const student = studentMap.get(studentId)!;
        student.total_outstanding += billAmount;
        if (isOverdue) {
          student.overdue_amount += billAmount;
        }

        student.bills.push({
          id: bill.id,
          bill_description: bill.bill_description,
          due_date: bill.due_date,
          amount: billAmount,
          status: bill.status
        });
      });

      return Array.from(studentMap.values())
        .filter((student) => student.total_outstanding > 0)
        .sort((a, b) => b.total_outstanding - a.total_outstanding);
    } catch (error) {
      console.error('Error in getOutstandingReport:', error);
      throw error;
    }
  }

  // Get collection report
  static async getCollectionReport(
    filters: BillingReportFilters = {}
  ): Promise<CollectionReport[]> {
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
          student:students(
            first_name,
            last_name,
            roll_number
          ),
          institution:institutions(name),
          refunds:billing_refunds(
            id,
            refund_amount,
            approval_status
          )
        `
        )
        .order('receipt_date', { ascending: false });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.date_from) {
        query = query.gte('receipt_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('receipt_date', filters.date_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching collection report:', error);
        throw new Error(`Failed to fetch collection report: ${error.message}`);
      }

      return (
        data?.map((receipt: any) => {
          // Calculate refund totals
          const processedRefunds =
            receipt.refunds?.filter(
              (r: any) => r.approval_status === 'processed'
            ) || [];
          const totalRefunds = processedRefunds.reduce(
            (sum: number, r: any) => sum + r.refund_amount,
            0
          );
          const hasRefunds = processedRefunds.length > 0;
          const netAmount = Math.max(0, receipt.payment_amount - totalRefunds);

          return {
            receipt_id: receipt.id,
            receipt_number: receipt.receipt_number,
            receipt_date: receipt.receipt_date,
            first_name: receipt.student?.first_name || '',
          last_name: receipt.student?.last_name || '',
            roll_number: receipt.student?.roll_number,
            institution_name: receipt.institution?.name || '',
            payment_mode: receipt.payment_mode,
            payment_amount: receipt.payment_amount,
            total_refunds: totalRefunds,
            net_amount: netAmount,
            has_refunds: hasRefunds,
            accountant_name: undefined // Will need to be fetched separately if needed
          };
        }) || []
      );
    } catch (error) {
      console.error('Error in getCollectionReport:', error);
      throw error;
    }
  }

  // Get discount report
  static async getDiscountReport(
    filters: BillingReportFilters = {}
  ): Promise<DiscountReport[]> {
    try {
      let query = this.supabase
        .from('billing_discounts')
        .select(
          `
          id,
          discount_category,
          discount_type,
          discount_value,
          discount_amount,
          approval_status,
          effective_date,
          bill:billing_student_bills(
            bill_description,
            student:students(
              first_name,
            last_name,
              roll_number,
              institution:institutions(name)
            )
          )
        `
        )
        .order('created_at', { ascending: false });

      if (filters.date_from) {
        query = query.gte('effective_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('effective_date', filters.date_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching discount report:', error);
        throw new Error(`Failed to fetch discount report: ${error.message}`);
      }

      return (
        data?.map((discount: any) => ({
          discount_id: discount.id,
          first_name: discount.bill?.student?.first_name || '',
          last_name: discount.bill?.student?.last_name || '',
          roll_number: discount.bill?.student?.roll_number,
          institution_name: discount.bill?.student?.institution?.name || '',
          bill_description: discount.bill?.bill_description || '',
          discount_category: discount.discount_category,
          discount_type: discount.discount_type,
          discount_value: discount.discount_value,
          discount_amount: discount.discount_amount,
          approval_status: discount.approval_status,
          effective_date: discount.effective_date,
          authorizer_name: undefined // Will need to be fetched separately if needed
        })) || []
      );
    } catch (error) {
      console.error('Error in getDiscountReport:', error);
      throw error;
    }
  }

  // Get refund report
  static async getRefundReport(
    filters: BillingReportFilters = {}
  ): Promise<RefundReport[]> {
    try {
      let query = this.supabase
        .from('billing_refunds')
        .select(
          `
          id,
          refund_category,
          refund_method,
          refund_amount,
          processing_fee,
          net_refund_amount,
          approval_status,
          refund_date,
          receipt:billing_receipts(
            receipt_number,
            student:students(
              first_name,
            last_name,
              roll_number,
              institution:institutions(name)
            )
          )
        `
        )
        .order('created_at', { ascending: false });

      if (filters.date_from) {
        query = query.gte('refund_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('refund_date', filters.date_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching refund report:', error);
        throw new Error(`Failed to fetch refund report: ${error.message}`);
      }

      return (
        data?.map((refund: any) => ({
          refund_id: refund.id,
          receipt_number: refund.receipt?.receipt_number || '',
          first_name: refund.receipt?.student?.first_name || '',
          last_name: refund.receipt?.student?.last_name || '',
          roll_number: refund.receipt?.student?.roll_number,
          institution_name: refund.receipt?.student?.institution?.name || '',
          refund_category: refund.refund_category,
          refund_method: refund.refund_method,
          refund_amount: refund.refund_amount,
          processing_fee: refund.processing_fee,
          net_refund_amount: refund.net_refund_amount,
          approval_status: refund.approval_status,
          refund_date: refund.refund_date
        })) || []
      );
    } catch (error) {
      console.error('Error in getRefundReport:', error);
      throw error;
    }
  }

  // Get invoice report
  static async getInvoiceReport(
    filters: BillingReportFilters = {}
  ): Promise<InvoiceReport[]> {
    try {
      let query = this.supabase
        .from('billing_invoices')
        .select(
          `
          id,
          invoice_number,
          invoice_date,
          invoice_type,
          grand_total,
          billing_period_from,
          billing_period_to,
          student:students(
            first_name,
            last_name,
            roll_number
          ),
          institution:institutions(name)
        `
        )
        .order('invoice_date', { ascending: false });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.date_from) {
        query = query.gte('invoice_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('invoice_date', filters.date_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching invoice report:', error);
        throw new Error(`Failed to fetch invoice report: ${error.message}`);
      }

      return (
        data?.map((invoice: any) => ({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          first_name: invoice.student?.first_name || '',
          last_name: invoice.student?.last_name || '',
          roll_number: invoice.student?.roll_number,
          institution_name: invoice.institution?.name || '',
          invoice_type: invoice.invoice_type,
          grand_total: invoice.grand_total,
          billing_period_from: invoice.billing_period_from,
          billing_period_to: invoice.billing_period_to
        })) || []
      );
    } catch (error) {
      console.error('Error in getInvoiceReport:', error);
      throw error;
    }
  }

  // Export report
  static async exportReport(
    reportType: string,
    filters: BillingReportFilters,
    options: ReportExportOptions
  ): Promise<void> {
    try {
      let data: any[];

      switch (reportType) {
        case 'outstanding':
          data = await this.getOutstandingReport(filters);
          break;
        case 'collection':
          data = await this.getCollectionReport(filters);
          break;
        case 'discount':
          data = await this.getDiscountReport(filters);
          break;
        case 'refund':
          data = await this.getRefundReport(filters);
          break;
        case 'invoice':
          data = await this.getInvoiceReport(filters);
          break;
        default:
          throw new Error('Invalid report type');
      }

      // TODO: Implement export logic based on format
      switch (options.format) {
        case 'pdf':
          await this.exportToPDF(reportType, data, options);
          break;
        case 'excel':
          await this.exportToExcel(reportType, data, options);
          break;
        case 'csv':
          await this.exportToCSV(reportType, data, options);
          break;
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      throw error;
    }
  }

  // Helper methods for metrics
  private static async getTotalStudents(
    institutionId?: string
  ): Promise<number> {
    let query = this.supabase
      .from('learners_profiles')
      .select('id', { count: 'exact', head: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { count } = await query;
    return count || 0;
  }

  private static async getTotalBills(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<number> {
    let query = this.supabase
      .from('billing_student_bills')
      .select('id', { count: 'exact', head: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { count } = await query;
    return count || 0;
  }

  private static async getTotalReceipts(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<number> {
    let query = this.supabase
      .from('billing_receipts')
      .select('id', { count: 'exact', head: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (dateFrom) {
      query = query.gte('receipt_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('receipt_date', dateTo);
    }

    const { count } = await query;
    return count || 0;
  }

  private static async getTotalAmountBilled(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<number> {
    let query = this.supabase
      .from('billing_student_bills')
      .select('final_amount');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { data } = await query;
    return data?.reduce((sum, bill: any) => sum + (bill.final_amount || 0), 0) || 0;
  }

  private static async getTotalAmountCollected(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<number> {
    // Get total receipt amounts
    let receiptQuery = this.supabase
      .from('billing_receipts')
      .select('payment_amount');

    if (institutionId) {
      receiptQuery = receiptQuery.eq('institution_id', institutionId);
    }

    if (dateFrom) {
      receiptQuery = receiptQuery.gte('receipt_date', dateFrom);
    }

    if (dateTo) {
      receiptQuery = receiptQuery.lte('receipt_date', dateTo);
    }

    const { data: receiptData } = await receiptQuery;
    const totalReceiptAmount =
      receiptData?.reduce(
        (sum, receipt: any) => sum + (receipt.payment_amount || 0),
        0
      ) || 0;

    // Get total processed refunds in the same date range
    let refundQuery = this.supabase
      .from('billing_refunds')
      .select(
        'refund_amount, receipt:billing_receipts!inner(institution_id, receipt_date)'
      )
      .eq('approval_status', 'processed');

    if (institutionId) {
      refundQuery = refundQuery.eq('receipt.institution_id', institutionId);
    }

    if (dateFrom) {
      refundQuery = refundQuery.gte('receipt.receipt_date', dateFrom);
    }

    if (dateTo) {
      refundQuery = refundQuery.lte('receipt.receipt_date', dateTo);
    }

    const { data: refundData } = await refundQuery;
    const totalProcessedRefunds =
      refundData?.reduce(
        (sum, refund: any) => sum + (refund.refund_amount || 0),
        0
      ) || 0;

    // Return net amount collected (receipts - refunds)
    return Math.max(0, totalReceiptAmount - totalProcessedRefunds);
  }

  private static async getTotalOutstanding(
    institutionId?: string
  ): Promise<number> {
    let query = this.supabase
      .from('billing_student_bills')
      .select('balance_amount')
      .in('status', ['unpaid', 'partially_paid', 'overdue']);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    return (
      data?.reduce((sum, bill: any) => sum + (bill.balance_amount || 0), 0) || 0
    );
  }

  private static async getTotalOverdue(
    institutionId?: string
  ): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    let query = this.supabase
      .from('billing_student_bills')
      .select('balance_amount')
      .eq('status', 'overdue')
      .lt('due_date', today);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    return (
      data?.reduce((sum, bill: any) => sum + (bill.balance_amount || 0), 0) || 0
    );
  }

  private static async getTotalDiscounts(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<number> {
    let query = this.supabase
      .from('billing_discounts')
      .select('discount_amount')
      .eq('approval_status', 'approved');

    if (dateFrom) {
      query = query.gte('effective_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('effective_date', dateTo);
    }

    const { data } = await query;
    return (
      data?.reduce(
        (sum, discount: any) => sum + (discount.discount_amount || 0),
        0
      ) || 0
    );
  }

  private static async getTotalRefunds(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<number> {
    let query = this.supabase
      .from('billing_refunds')
      .select(
        'refund_amount, receipt:billing_receipts!inner(institution_id, receipt_date)'
      )
      .eq('approval_status', 'processed');

    if (institutionId) {
      query = query.eq('receipt.institution_id', institutionId);
    }

    if (dateFrom) {
      query = query.gte('receipt.receipt_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('receipt.receipt_date', dateTo);
    }

    const { data } = await query;
    return (
      data?.reduce((sum, refund: any) => sum + (refund.refund_amount || 0), 0) || 0
    );
  }

  private static async getRecentTransactions(
    institutionId?: string,
    limit: number = 10
  ): Promise<any> {
    // Get recent receipts, bills, and refunds
    const [receipts, bills, refunds] = await Promise.all([
      this.getRecentReceipts(institutionId, limit),
      this.getRecentBills(institutionId, limit),
      this.getRecentRefunds(institutionId, limit)
    ]);

    return { receipts, bills, refunds };
  }

  private static async getRecentReceipts(
    institutionId?: string,
    limit: number = 10
  ): Promise<any[]> {
    let query = this.supabase
      .from('billing_receipts')
      .select(
        `
        *,
        student:students(first_name, last_name, roll_number),
        institution:institutions(name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    return data || [];
  }

  private static async getRecentBills(
    institutionId?: string,
    limit: number = 10
  ): Promise<any[]> {
    let query = this.supabase
      .from('billing_student_bills')
      .select(
        `
        *,
        student:students(first_name, last_name, roll_number),
        institution:institutions(name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data } = await query;
    return data || [];
  }

  private static async getRecentRefunds(
    institutionId?: string,
    limit: number = 10
  ): Promise<any[]> {
    const query = this.supabase
      .from('billing_refunds')
      .select(
        `
        *,
        receipt:billing_receipts(
          receipt_number,
          student:students(student_name, roll_number)
        )
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data } = await query;
    return data || [];
  }

  private static async getMonthlyCollection(
    institutionId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<any[]> {
    try {
      // Get monthly receipts
      let receiptQuery = this.supabase
        .from('billing_receipts')
        .select('payment_amount, receipt_date');

      if (institutionId) {
        receiptQuery = receiptQuery.eq('institution_id', institutionId);
      }

      if (dateFrom) {
        receiptQuery = receiptQuery.gte('receipt_date', dateFrom);
      }

      if (dateTo) {
        receiptQuery = receiptQuery.lte('receipt_date', dateTo);
      }

      const { data: receipts } = await receiptQuery;

      // Get monthly refunds
      let refundQuery = this.supabase
        .from('billing_refunds')
        .select(
          'refund_amount, refund_date, receipt:billing_receipts!inner(institution_id)'
        )
        .eq('approval_status', 'processed');

      if (institutionId) {
        refundQuery = refundQuery.eq('receipt.institution_id', institutionId);
      }

      const { data: refunds } = await refundQuery;

      // Group by month and calculate net collection
      const monthlyData = new Map<string, number>();

      // Add receipts
      receipts?.forEach((receipt: any) => {
        const month = new Date(receipt.receipt_date).toISOString().slice(0, 7); // YYYY-MM
        monthlyData.set(
          month,
          (monthlyData.get(month) || 0) + receipt.payment_amount
        );
      });

      // Subtract refunds
      refunds?.forEach((refund: any) => {
        const month = new Date(refund.refund_date).toISOString().slice(0, 7); // YYYY-MM
        monthlyData.set(
          month,
          (monthlyData.get(month) || 0) - refund.refund_amount
        );
      });

      // Convert to array and sort by month
      return Array.from(monthlyData.entries())
        .map(([month, amount]) => ({ month, amount: Math.max(0, amount) }))
        .sort((a, b) => a.month.localeCompare(b.month));
    } catch (error) {
      console.error('Error in getMonthlyCollection:', error);
      return [];
    }
  }

  private static async getInstitutionWiseSummary(
    institutionId?: string
  ): Promise<any[]> {
    try {
      // Get institution data
      let institutionQuery = this.supabase
        .from('institutions')
        .select('id, name');

      if (institutionId) {
        institutionQuery = institutionQuery.eq('id', institutionId);
      }

      const { data: institutions } = await institutionQuery;

      if (!institutions) return [];

      const summaries = await Promise.all(
        institutions.map(async (institution: any) => {
          // Get bills count and amount billed
          const { data: bills } = await this.supabase
            .from('billing_student_bills')
            .select('final_amount')
            .eq('institution_id', institution.id);

          const totalBills = bills?.length || 0;
          const amountBilled =
            bills?.reduce((sum, bill: any) => sum + bill.final_amount, 0) || 0;

          // Get receipts amount
          const { data: receipts } = await this.supabase
            .from('billing_receipts')
            .select('payment_amount')
            .eq('institution_id', institution.id);

          const totalReceiptAmount =
            receipts?.reduce(
              (sum, receipt: any) => sum + receipt.payment_amount,
              0
            ) || 0;

          // Get processed refunds for this institution
          const { data: refunds } = await this.supabase
            .from('billing_refunds')
            .select(
              'refund_amount, receipt:billing_receipts!inner(institution_id)'
            )
            .eq('receipt.institution_id', institution.id)
            .eq('approval_status', 'processed');

          const totalRefunds =
            refunds?.reduce((sum, refund: any) => sum + refund.refund_amount, 0) ||
            0;

          // Calculate net collection and outstanding
          const netAmountCollected = Math.max(
            0,
            totalReceiptAmount - totalRefunds
          );
          const outstanding = Math.max(0, amountBilled - netAmountCollected);

          return {
            institution_id: institution.id,
            institution_name: institution.name,
            total_bills: totalBills,
            amount_billed: amountBilled,
            amount_collected: netAmountCollected,
            outstanding: outstanding
          };
        })
      );

      return summaries.filter((summary) => summary.total_bills > 0);
    } catch (error) {
      console.error('Error in getInstitutionWiseSummary:', error);
      return [];
    }
  }

  // Export helper methods (to be implemented)
  private static async exportToPDF(
    reportType: string,
    data: any[],
    options: ReportExportOptions
  ): Promise<void> {
    // TODO: Implement PDF export
    console.log(
      `Exporting ${reportType} report to PDF`,
      data.length,
      'records'
    );
  }

  private static async exportToExcel(
    reportType: string,
    data: any[],
    options: ReportExportOptions
  ): Promise<void> {
    // TODO: Implement Excel export
    console.log(
      `Exporting ${reportType} report to Excel`,
      data.length,
      'records'
    );
  }

  private static async exportToCSV(
    reportType: string,
    data: any[],
    options: ReportExportOptions
  ): Promise<void> {
    // TODO: Implement CSV export
    console.log(
      `Exporting ${reportType} report to CSV`,
      data.length,
      'records'
    );
  }
}
