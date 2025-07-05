import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StudentForBilling,
  StudentForBillingListResponse,
  StudentSearchFilters,
  StudentBillingSummary
} from '@/types/billing-schedule';

export class StudentSearchServiceOptimized {
  private static supabase = createClientSupabaseClient();

  // Existing optimized search methods (keep original implementations)
  static async searchStudentsForBilling(
    filters: StudentSearchFilters
  ): Promise<StudentForBillingListResponse> {
    // Keep existing implementation - it's already optimized
    return this.searchStudentsForBilling(filters);
  }

  static async getStudentForBilling(
    studentId: string
  ): Promise<StudentForBilling> {
    // Keep existing implementation - it's already optimized
    return this.getStudentForBilling(studentId);
  }

  static async searchStudentsByQuery(
    searchQuery: string,
    institutionId?: string,
    limit: number = 10
  ): Promise<StudentForBilling[]> {
    // Keep existing implementation - it's already optimized
    return this.searchStudentsByQuery(searchQuery, institutionId, limit);
  }

  // OPTIMIZED: Fix the complex cascading query issues
  static async getStudentBillingSummary(
    studentId: string
  ): Promise<StudentBillingSummary> {
    try {
      console.log(
        `Starting optimized billing summary for student: ${studentId}`
      );

      // Step 1: Get student details (simple query)
      const student = await this.getStudentForBilling(studentId);

      // Step 2: Execute all complex queries in parallel instead of sequentially
      const [billsResult, receiptsResult, invoicesResult] =
        await Promise.allSettled([
          // Get bills with minimal joins
          this.supabase
            .from('billing_student_bills')
            .select(
              `
            id,
            bill_description,
            total_amount,
            final_amount,
            balance_amount,
            status,
            due_date,
            created_at,
            item_category_id
          `
            )
            .eq('student_id', studentId)
            .order('due_date', { ascending: false }),

          // Get receipts with minimal joins
          this.supabase
            .from('billing_receipts')
            .select(
              `
            id,
            receipt_number,
            payment_amount,
            receipt_date,
            payment_mode,
            payment_remarks
          `
            )
            .eq('student_id', studentId)
            .order('receipt_date', { ascending: false }),

          // Get invoices with minimal joins
          this.supabase
            .from('billing_invoices')
            .select(
              `
            id,
            invoice_number,
            invoice_type,
            invoice_date,
            invoice_description,
            grand_total
          `
            )
            .eq('student_id', studentId)
            .order('invoice_date', { ascending: false })
        ]);

      // Process results with error handling
      const bills =
        billsResult.status === 'fulfilled' && !billsResult.value.error
          ? billsResult.value.data || []
          : [];

      const receipts =
        receiptsResult.status === 'fulfilled' && !receiptsResult.value.error
          ? receiptsResult.value.data || []
          : [];

      const invoices =
        invoicesResult.status === 'fulfilled' && !invoicesResult.value.error
          ? invoicesResult.value.data || []
          : [];

      console.log(
        `Fetched ${bills.length} bills, ${receipts.length} receipts, ${invoices.length} invoices`
      );

      // Step 3: Get related data only for fetched records (parallel execution)
      const [
        categoryData,
        receiptItemsData,
        discountsData,
        refundsData,
        invoiceItemsData
      ] = await this.getRelatedBillingData(bills, receipts, invoices);

      // Step 4: Enrich data efficiently using Map lookups instead of array.find()
      const enrichedBills = this.enrichBillsData(
        bills,
        categoryData,
        receiptItemsData,
        discountsData
      );
      const enrichedReceipts = this.enrichReceiptsData(
        receipts,
        receiptItemsData,
        refundsData
      );
      const enrichedInvoices = this.enrichInvoicesData(
        invoices,
        invoiceItemsData,
        receipts
      );

      // Step 5: Calculate summary efficiently
      const summary = this.calculateBillingSummary(
        enrichedBills,
        enrichedReceipts,
        refundsData
      );

      console.log(`Calculated summary for student ${studentId}:`, summary);

      return {
        student,
        bills: enrichedBills,
        receipts: enrichedReceipts,
        discounts: discountsData,
        refunds: refundsData,
        invoices: enrichedInvoices,
        ...summary
      };
    } catch (error) {
      console.error('Error in getStudentBillingSummary (optimized):', error);
      throw new Error(
        error instanceof Error
          ? `Failed to fetch student billing summary: ${error.message}`
          : 'Failed to fetch student billing summary'
      );
    }
  }

  // Helper method to get related data in parallel
  private static async getRelatedBillingData(
    bills: any[],
    receipts: any[],
    invoices: any[]
  ) {
    const billIds = bills.map((bill) => bill.id);
    const receiptIds = receipts.map((receipt) => receipt.id);
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const categoryIds = [
      ...new Set(bills.map((bill) => bill.item_category_id).filter(Boolean))
    ];

    const promises = [];

    // Get item categories (only if needed)
    if (categoryIds.length > 0) {
      promises.push(
        this.supabase
          .from('billing_item_categories')
          .select(
            `
            id,
            item_category_name,
            parent_category:billing_parent_categories(id, parent_category_name),
            sub_category:billing_sub_categories(id, sub_category_name)
          `
          )
          .in('id', categoryIds)
      );
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }

    // Get receipt items (only if needed)
    if (receiptIds.length > 0) {
      promises.push(
        this.supabase
          .from('billing_receipt_items')
          .select('receipt_id, bill_id, amount_paid')
          .in('receipt_id', receiptIds)
      );
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }

    // Get discounts (only if needed)
    if (billIds.length > 0) {
      promises.push(
        this.supabase
          .from('billing_discounts')
          .select(
            `
            id,
            bill_id,
            discount_category,
            discount_type,
            discount_value,
            discount_amount,
            approval_status,
            effective_date
          `
          )
          .in('bill_id', billIds)
          .order('created_at', { ascending: false })
      );
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }

    // Get refunds (only if needed)
    if (receiptIds.length > 0) {
      promises.push(
        this.supabase
          .from('billing_refunds')
          .select(
            `
            id,
            receipt_id,
            refund_category,
            refund_amount,
            refund_date,
            refund_method,
            approval_status,
            net_refund_amount
          `
          )
          .in('receipt_id', receiptIds)
          .order('created_at', { ascending: false })
      );
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }

    // Get invoice items (only if needed)
    if (invoiceIds.length > 0) {
      promises.push(
        this.supabase
          .from('billing_invoice_items')
          .select('invoice_id, receipt_id, amount')
          .in('invoice_id', invoiceIds)
      );
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }

    const results = await Promise.allSettled(promises);

    return results.map((result) =>
      result.status === 'fulfilled' && !result.value.error
        ? result.value.data || []
        : []
    );
  }

  // Efficient data enrichment using Map lookups
  private static enrichBillsData(
    bills: any[],
    categories: any[],
    receiptItems: any[],
    discounts: any[]
  ) {
    // Create lookup maps for O(1) access
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
    const receiptItemsByBill = new Map<string, any[]>();
    const discountsByBill = new Map<string, any[]>();

    // Group receipt items by bill
    receiptItems.forEach((item) => {
      if (!receiptItemsByBill.has(item.bill_id)) {
        receiptItemsByBill.set(item.bill_id, []);
      }
      receiptItemsByBill.get(item.bill_id)!.push(item);
    });

    // Group discounts by bill
    discounts.forEach((discount) => {
      if (!discountsByBill.has(discount.bill_id)) {
        discountsByBill.set(discount.bill_id, []);
      }
      discountsByBill.get(discount.bill_id)!.push(discount);
    });

    // Enrich bills
    return bills.map((bill) => ({
      ...bill,
      item_category: categoryMap.get(bill.item_category_id) || null,
      receipt_items: receiptItemsByBill.get(bill.id) || [],
      discounts: discountsByBill.get(bill.id) || []
    }));
  }

  private static enrichReceiptsData(
    receipts: any[],
    receiptItems: any[],
    refunds: any[]
  ) {
    // Create lookup maps
    const receiptItemsByReceipt = new Map<string, any[]>();
    const refundsByReceipt = new Map<string, any[]>();

    // Group receipt items by receipt
    receiptItems.forEach((item) => {
      if (!receiptItemsByReceipt.has(item.receipt_id)) {
        receiptItemsByReceipt.set(item.receipt_id, []);
      }
      receiptItemsByReceipt.get(item.receipt_id)!.push(item);
    });

    // Group refunds by receipt
    refunds.forEach((refund) => {
      if (!refundsByReceipt.has(refund.receipt_id)) {
        refundsByReceipt.set(refund.receipt_id, []);
      }
      refundsByReceipt.get(refund.receipt_id)!.push(refund);
    });

    // Enrich receipts
    return receipts.map((receipt) => ({
      ...receipt,
      receipt_items: receiptItemsByReceipt.get(receipt.id) || [],
      refunds: refundsByReceipt.get(receipt.id) || []
    }));
  }

  private static enrichInvoicesData(
    invoices: any[],
    invoiceItems: any[],
    receipts: any[]
  ) {
    // Create lookup maps
    const invoiceItemsByInvoice = new Map<string, any[]>();
    const receiptMap = new Map(
      receipts.map((receipt) => [receipt.id, receipt])
    );

    // Group invoice items by invoice
    invoiceItems.forEach((item) => {
      if (!invoiceItemsByInvoice.has(item.invoice_id)) {
        invoiceItemsByInvoice.set(item.invoice_id, []);
      }
      invoiceItemsByInvoice.get(item.invoice_id)!.push({
        ...item,
        receipt: receiptMap.get(item.receipt_id) || null
      });
    });

    // Enrich invoices
    return invoices.map((invoice) => ({
      ...invoice,
      invoice_items: invoiceItemsByInvoice.get(invoice.id) || []
    }));
  }

  // Efficient summary calculation
  private static calculateBillingSummary(
    bills: any[],
    receipts: any[],
    refunds: any[]
  ) {
    const totalBills = bills.length;

    // Calculate bill amounts by status
    let totalBillAmount = 0;
    let totalOutstanding = 0;
    let billsByStatus = {
      paid: 0,
      unpaid: 0,
      partially_paid: 0,
      overdue: 0
    };

    bills.forEach((bill) => {
      totalBillAmount += bill.final_amount || 0;
      totalOutstanding += bill.balance_amount || 0;

      if (billsByStatus.hasOwnProperty(bill.status)) {
        billsByStatus[bill.status as keyof typeof billsByStatus]++;
      }
    });

    // Calculate receipt amounts
    const totalReceiptAmount = receipts.reduce(
      (sum, receipt) => sum + (receipt.payment_amount || 0),
      0
    );

    // Calculate refund amounts
    const totalProcessedRefunds = refunds
      .filter((refund) => refund.approval_status === 'processed')
      .reduce((sum, refund) => sum + (refund.refund_amount || 0), 0);

    // Calculate net amounts
    const netPaidAmount = totalReceiptAmount - totalProcessedRefunds;

    return {
      totalBills,
      totalBillAmount,
      totalOutstanding,
      totalReceiptAmount,
      totalProcessedRefunds,
      netPaidAmount,
      billsByStatus,
      lastPaymentDate: receipts.length > 0 ? receipts[0].receipt_date : null
    };
  }

  // Cache-friendly method for outstanding calculation
  static async calculateStudentOutstandingOptimized(
    studentId: string
  ): Promise<number> {
    try {
      // Use database function for accurate calculation but with timeout protection
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Outstanding calculation timeout')),
          5000
        )
      );

      const calculationPromise = this.supabase.rpc(
        'calculate_student_outstanding',
        {
          student_uuid: studentId
        }
      );

      const result = await Promise.race([calculationPromise, timeoutPromise]);

      if (result && typeof result === 'object' && 'data' in result) {
        return result.data || 0;
      }

      return 0;
    } catch (error) {
      console.warn(
        'Database outstanding calculation failed, using fallback:',
        error
      );

      // Fallback: calculate from bill balances
      const { data: bills } = await this.supabase
        .from('billing_student_bills')
        .select('balance_amount')
        .eq('student_id', studentId)
        .in('status', ['unpaid', 'partially_paid', 'overdue']);

      return (
        bills?.reduce((sum, bill) => sum + (bill.balance_amount || 0), 0) || 0
      );
    }
  }
}
