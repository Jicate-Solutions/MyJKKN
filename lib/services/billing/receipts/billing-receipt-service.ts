import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  BillingReceipt,
  ReceiptFilters,
  ReceiptListResponse,
  CreateReceiptDto,
  UpdateReceiptDto,
  BulkOperationResult
} from '@/types/billing-schedule';
import { logger } from '@/lib/utils/enhanced-logger';
import { trackUsage } from '@/lib/utils/track-usage';

export class BillingReceiptService {
  private static supabase = createClientSupabaseClient();

  // Get the appropriate Supabase client (passed or default)
  private static getClient(providedClient?: SupabaseClient): any {
    return providedClient || this.supabase;
  }

  // Generate a unique receipt number using database function
  private static async generateReceiptNumber(supabaseClient?: SupabaseClient): Promise<string> {
    const client = this.getClient(supabaseClient);
    try {
      // Use the database function for generating receipt numbers
      const { data, error } = await client.rpc(
        'generate_receipt_number'
      );

      if (error) {
        logger.error('billing/receipts', 'Error calling generate_receipt_number function', error);
        throw error;
      }

      if (!data) {
        throw new Error('Database function returned null receipt number');
      }

      logger.info('billing/receipts', 'Generated receipt number from database', { receiptNumber: data });
      return data;
    } catch (error) {
      logger.error('billing/receipts', 'Error in generateReceiptNumber', error);
      // Fallback to timestamp-based approach if database function fails
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');

      // Format: RCP-YYYY-MMDD-HHMMSS
      const fallbackNumber = `RCP-${year}-${month}${day}-${hours}${minutes}${seconds}`;
      logger.warn('billing/receipts', 'Using fallback receipt number', { fallbackNumber });
      return fallbackNumber;
    }
  }

  /**
   * Creates a billing receipt with automatic bill status updates.
   *
   * @param receiptData - The receipt data to create
   * @param supabaseClient - Optional Supabase client for server-side execution (API routes/callbacks)
   *                         If not provided, uses the default client-side client
   * @returns The created receipt
   */
  static async createBillingReceipt(
    receiptData: CreateReceiptDto,
    supabaseClient?: SupabaseClient
  ): Promise<BillingReceipt> {
    const client = this.getClient(supabaseClient);

    try {
      // Get current user ID (may be null for service role client)
      let currentUserId: string | undefined;
      try {
        const { data: userData } = await client.auth.getUser();
        currentUserId = userData?.user?.id;
      } catch {
        // Service role client may not have user context
        logger.dev('billing/receipts', 'No user context available (likely server-side execution)');
      }

      // Generate receipt number
      const receiptNumber = await this.generateReceiptNumber(client);

      if (!receiptNumber) {
        throw new Error('Failed to generate receipt number');
      }

      logger.info('billing/receipts', 'Creating receipt', { receiptNumber });

      // Start a transaction to create receipt and receipt items
      const { data: receipt, error: receiptError } = await client
        .from('billing_receipts')
        .insert({
          receipt_number: receiptNumber,
          receipt_date: new Date().toISOString().split('T')[0], // Current date for receipt generation
          student_id: receiptData.student_id,
          institution_id: receiptData.institution_id,
          payment_mode: receiptData.payment_mode,
          payment_reference_number: receiptData.payment_reference_number,
          payment_amount: receiptData.payment_amount,
          payment_paid_date: receiptData.payment_paid_date,
          payer_name: receiptData.payer_name,
          payer_contact: receiptData.payer_contact,
          accountant_id: receiptData.accountant_id,
          payment_remarks: receiptData.payment_remarks,
          created_by: currentUserId
        })
        .select(
          `
          *,
          student:learners_profiles (
            id,
            first_name,
            last_name,
            roll_number,
            college_email
          ),
          institution:institutions (
            id,
            name,
            counselling_code
          )
        `
        )
        .single();

      if (receiptError) {
        logger.error('billing/receipts', 'Receipt creation error', receiptError);
        throw receiptError;
      }

      logger.info('billing/receipts', 'Receipt created successfully', { receiptId: receipt.id });

      // Create receipt items
      if (receiptData.receipt_items && receiptData.receipt_items.length > 0) {
        const receiptItems = receiptData.receipt_items.map((item) => ({
          receipt_id: receipt.id,
          bill_id: item.bill_id,
          amount_paid: item.amount_paid
        }));

        const { error: itemsError } = await client
          .from('billing_receipt_items')
          .insert(receiptItems);

        if (itemsError) {
          logger.error('billing/receipts', 'Receipt items creation error', itemsError);
          throw itemsError;
        }

        logger.info('billing/receipts', 'Receipt items created successfully');

        // Manual validation and update as fallback in case trigger fails
        for (const item of receiptData.receipt_items) {
          await this.validateAndUpdateBillStatus(item.bill_id, client);

          // Check if bill is now fully paid and generate invoice if needed
          await this.checkAndGenerateInvoice(item.bill_id, client);
        }
      }

      trackUsage({ module: 'billing/receipts', feature: 'create_receipt', eventType: 'create' });
      return receipt;
    } catch (error) {
      logger.error('billing/receipts', 'Error creating receipt', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create receipt'
      );
    }
  }

  static async updateBillingReceipt(
    id: string,
    receiptData: UpdateReceiptDto
  ): Promise<BillingReceipt> {
    try {
      const updateQuery: any = this.supabase.from('billing_receipts');
      const { data, error } = await updateQuery
        .update(receiptData as any)
        .eq('id', id)
        .select(
          `
          *,
          student:learners_profiles (
            id,
            first_name,
            last_name,
            roll_number,
            college_email
          ),
          institution:institutions (
            id,
            name,
            counselling_code
          )
        `
        )
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating receipt:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update receipt'
      );
    }
  }

  static async deleteBillingReceipt(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_receipts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting receipt:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete receipt'
      );
    }
  }

  static async getBillingReceipts(
    filters: ReceiptFilters = {}
  ): Promise<ReceiptListResponse> {
    try {
      let query = (this.supabase as any).from('billing_receipts').select(
        `
          *,
          student:learners_profiles (
            id,
            first_name,
            last_name,
            roll_number,
            college_email
          ),
          institution:institutions (
            id,
            name,
            counselling_code
          ),
          refunds:billing_refunds(
            id,
            refund_amount,
            approval_status
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `receipt_number.ilike.%${filters.search}%,payer_name.ilike.%${filters.search}%`
        );
      }

      if (filters.student_id) {
        query = query.eq('student_id', filters.student_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.payment_mode) {
        query = query.eq('payment_mode', filters.payment_mode);
      }

      if (filters.receipt_date_from) {
        query = query.gte('receipt_date', filters.receipt_date_from);
      }

      if (filters.receipt_date_to) {
        query = query.lte('receipt_date', filters.receipt_date_to);
      }

      if (filters.amount_from) {
        query = query.gte('payment_amount', filters.amount_from);
      }

      if (filters.amount_to) {
        query = query.lte('payment_amount', filters.amount_to);
      }

      if (filters.payer_name) {
        query = query.ilike('payer_name', `%${filters.payer_name}%`);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'receipt_date';
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
      console.error('Error fetching receipts:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch receipts'
      );
    }
  }

  static async getBillingReceipt(id: string): Promise<BillingReceipt> {
    try {
      const { data, error } = await this.supabase
        .from('billing_receipts')
        .select(
          `
          *,
          student:learners_profiles (
            id,
            first_name,
            last_name,
            roll_number,
            college_email
          ),
          institution:institutions (
            id,
            name,
            counselling_code
          ),
          receipt_items:billing_receipt_items (
            *,
            bill:billing_student_bills (
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
            )
          ),
          refunds:billing_refunds(
            *,
            authorizer:profiles!fk_billing_refunds_authorizer(id, full_name),
            approver:profiles!fk_billing_refunds_approved_by(id, full_name)
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as BillingReceipt;
    } catch (error) {
      console.error('Error fetching receipt:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch receipt'
      );
    }
  }

  static async printReceipt(id: string): Promise<void> {
    try {
      // Implementation for printing receipt
      // This would typically generate a PDF and trigger print dialog
      const receipt = await this.getBillingReceipt(id);

      // TODO: Implement actual printing logic
      console.log('Printing receipt:', receipt);
    } catch (error) {
      console.error('Error printing receipt:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to print receipt'
      );
    }
  }

  static async emailReceipt(id: string, email: string): Promise<void> {
    try {
      // Implementation for emailing receipt
      // This would typically send an email with the receipt PDF
      const receipt = await this.getBillingReceipt(id);

      // TODO: Implement actual email sending logic
      console.log('Emailing receipt to:', email, receipt);
    } catch (error) {
      console.error('Error emailing receipt:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to email receipt'
      );
    }
  }

  static async downloadReceiptPDF(id: string): Promise<void> {
    try {
      // Get receipt data
      const receipt = await this.getBillingReceipt(id);

      // Generate PDF content (this would typically use a PDF library like jsPDF or Puppeteer)
      // For now, we'll create a simple HTML representation and trigger download
      const pdfContent = this.generateReceiptHTML(receipt);

      // Create a blob and download it
      const blob = new Blob([pdfContent], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${receipt.receipt_number}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      window.URL.revokeObjectURL(url);

      console.log(
        'Receipt PDF download initiated for:',
        receipt.receipt_number
      );
    } catch (error) {
      console.error('Error downloading receipt PDF:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to download receipt PDF'
      );
    }
  }

  private static generateReceiptHTML(receipt: BillingReceipt): string {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    const formatDate = (date: string) => {
      return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    };

    // Calculate refund totals
    const processedRefunds =
      receipt.refunds?.filter((r) => r.approval_status === 'processed') || [];
    const totalProcessedRefunds = processedRefunds.reduce(
      (sum, r) => sum + r.refund_amount,
      0
    );
    const hasProcessedRefunds = processedRefunds.length > 0;
    const netReceiptAmount = receipt.payment_amount - totalProcessedRefunds;

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt ${receipt.receipt_number}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .receipt-info { margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        .section h3 { border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
        .amount { font-size: 18px; font-weight: bold; color: #2563eb; }
        .refunded-amount { color: #dc2626; text-decoration: line-through; }
        .net-amount { color: #16a34a; font-weight: bold; }
        .refund-summary { background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .refund-positive { background-color: #f0fdf4; border-color: #bbf7d0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        .total-row { font-weight: bold; background-color: #f9f9f9; }
        .refund-row { background-color: #fef2f2; color: #dc2626; }
        .net-row { background-color: #f0fdf4; color: #16a34a; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Payment Receipt</h1>
        <h2>${receipt.institution?.name || 'Institution'}</h2>
        <p>Receipt #${receipt.receipt_number}</p>
    </div>

    <div class="section">
        <h3>Receipt Information</h3>
        <div class="info-row">
            <span>Receipt Date:</span>
            <span>${formatDate(receipt.receipt_date)}</span>
        </div>
        <div class="info-row">
            <span>Payment Date:</span>
            <span>${formatDate(receipt.payment_paid_date)}</span>
        </div>
        <div class="info-row">
            <span>Payment Mode:</span>
            <span>${receipt.payment_mode.toUpperCase()}</span>
        </div>
        ${
          receipt.payment_reference_number
            ? `
        <div class="info-row">
            <span>Reference Number:</span>
            <span>${receipt.payment_reference_number}</span>
        </div>
        `
            : ''
        }
        <div class="info-row">
            <span>Original Amount:</span>
            <span class="amount ${
              hasProcessedRefunds ? 'refunded-amount' : ''
            }">${formatCurrency(receipt.payment_amount)}</span>
        </div>
        ${
          hasProcessedRefunds
            ? `
        <div class="info-row">
            <span>Total Refunded:</span>
            <span style="color: #dc2626;">-${formatCurrency(
              totalProcessedRefunds
            )}</span>
        </div>
        <div class="info-row">
            <span>Net Amount:</span>
            <span class="net-amount">${formatCurrency(netReceiptAmount)}</span>
        </div>
        `
            : ''
        }
    </div>

    <div class="section">
        <h3>Student Information</h3>
        <div class="info-row">
            <span>Name:</span>
            <span>${receipt.student?.first_name || 'N/A'} ${receipt.student?.last_name || ''}</span>
        </div>
        ${
          receipt.student?.roll_number
            ? `
        <div class="info-row">
            <span>Roll Number:</span>
            <span>${receipt.student.roll_number}</span>
        </div>
        `
            : ''
        }
        <div class="info-row">
            <span>Email:</span>
            <span>${receipt.student?.college_email || 'N/A'}</span>
        </div>
    </div>

    <div class="section">
        <h3>Payer Information</h3>
        <div class="info-row">
            <span>Payer Name:</span>
            <span>${receipt.payer_name}</span>
        </div>
        ${
          receipt.payer_contact
            ? `
        <div class="info-row">
            <span>Contact:</span>
            <span>${receipt.payer_contact}</span>
        </div>
        `
            : ''
        }
    </div>

    ${
      receipt.receipt_items && receipt.receipt_items.length > 0
        ? `
    <div class="section">
        <h3>Payment Details</h3>
        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Due Date</th>
                    <th>Bill Amount</th>
                    <th>Amount Paid</th>
                </tr>
            </thead>
            <tbody>
                ${receipt.receipt_items
                  .map(
                    (item) => `
                <tr>
                    <td>${
                      item.bill?.bill_description ||
                      item.bill?.item_category?.item_category_name ||
                      'N/A'
                    }</td>
                    <td>${
                      item.bill?.due_date
                        ? formatDate(item.bill.due_date)
                        : 'N/A'
                    }</td>
                    <td>${
                      item.bill?.final_amount
                        ? formatCurrency(item.bill.final_amount)
                        : 'N/A'
                    }</td>
                    <td>${formatCurrency(item.amount_paid)}</td>
                </tr>
                `
                  )
                  .join('')}
                <tr class="total-row">
                    <td colspan="3">Total Paid</td>
                    <td>${formatCurrency(receipt.payment_amount)}</td>
                </tr>
                ${
                  hasProcessedRefunds
                    ? `
                <tr class="refund-row">
                    <td colspan="3">Total Refunded</td>
                    <td>-${formatCurrency(totalProcessedRefunds)}</td>
                </tr>
                <tr class="net-row">
                    <td colspan="3">Net Amount</td>
                    <td>${formatCurrency(netReceiptAmount)}</td>
                </tr>
                `
                    : ''
                }
            </tbody>
        </table>
    </div>
    `
        : ''
    }

    ${
      hasProcessedRefunds && receipt.refunds
        ? `
    <div class="section">
        <h3>Refund Details</h3>
        <div class="refund-summary">
            <table>
                <thead>
                    <tr>
                        <th>Refund Date</th>
                        <th>Category</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${receipt.refunds
                      .filter((r) => r.approval_status === 'processed')
                      .map(
                        (refund) => `
                    <tr>
                        <td>${formatDate(refund.refund_date)}</td>
                        <td>${refund.refund_category
                          .replace('_', ' ')
                          .toUpperCase()}</td>
                        <td>${refund.refund_method
                          .replace('_', ' ')
                          .toUpperCase()}</td>
                        <td>₹${refund.refund_amount.toLocaleString()}</td>
                        <td>PROCESSED</td>
                    </tr>
                    `
                      )
                      .join('')}
                </tbody>
            </table>
            <div style="margin-top: 10px; text-align: center;">
                <p><strong>Total Refunded: ${formatCurrency(
                  totalProcessedRefunds
                )}</strong></p>
                <p style="color: #16a34a;"><strong>Net Receipt Amount: ${formatCurrency(
                  netReceiptAmount
                )}</strong></p>
            </div>
        </div>
    </div>
    `
        : ''
    }

    ${
      receipt.payment_remarks
        ? `
    <div class="section">
        <h3>Remarks</h3>
        <p>${receipt.payment_remarks}</p>
    </div>
    `
        : ''
    }

    <div class="section" style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
        <p>This is a computer-generated receipt.</p>
        <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
        ${
          hasProcessedRefunds
            ? '<p style="color: #dc2626; font-weight: bold;">Note: This receipt has been partially or fully refunded.</p>'
            : ''
        }
    </div>
</body>
</html>
    `;
  }

  static async bulkGenerateReceipts(
    receipts: CreateReceiptDto[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const receiptData of receipts) {
      try {
        const receipt = await this.createBillingReceipt(receiptData);
        results.success.push(receipt.id);
      } catch (error) {
        results.failed.push({
          id: receiptData.student_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  // Method to get receipts by bill ID
  static async getReceiptsByBillId(billId: string): Promise<BillingReceipt[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_receipts')
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            college_email
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          receipt_items:billing_receipt_items(
            *,
            bill:billing_student_bills(*)
          )
        `
        )
        .eq('receipt_items.bill_id', billId);

      if (error) throw error;
      return (data || []) as BillingReceipt[];
    } catch (error) {
      console.error('Error fetching receipts by bill ID:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch receipts'
      );
    }
  }

  // Method to get multiple bills by their IDs for receipt generation
  static async getBillsByIds(billIds: string[]): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          item_category:billing_item_categories (
            id,
            item_category_name,
            parent_category:billing_parent_categories (
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories (
              id,
              sub_category_name
            )
          ),
          student:learners_profiles (
            id,
            first_name,
            last_name,
            roll_number,
            college_email,
            institution_id
          )
        `
        )
        .in('id', billIds)
        .in('status', ['unpaid', 'partially_paid']); // Include both unpaid and partially paid bills for receipt generation

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch bills'
      );
    }
  }

  // Helper method to validate and update bill status manually
  private static async validateAndUpdateBillStatus(
    billId: string,
    supabaseClient?: SupabaseClient
  ): Promise<void> {
    const client = this.getClient(supabaseClient);

    try {
      // Get current bill details
      const { data: bill, error: billError } = await client
        .from('billing_student_bills')
        .select('id, final_amount, status, balance_amount')
        .eq('id', billId)
        .single();

      if (billError || !bill) {
        logger.error('billing/receipts', 'Error fetching bill for validation', billError);
        return;
      }

      // Calculate total payments for this bill
      const { data: receiptItems, error: itemsError } = await client
        .from('billing_receipt_items')
        .select('amount_paid')
        .eq('bill_id', billId);

      if (itemsError) {
        logger.error('billing/receipts', 'Error fetching receipt items for validation', itemsError);
        return;
      }

      const totalPaid =
        receiptItems?.reduce((sum, item) => sum + item.amount_paid, 0) || 0;
      const billAmount = bill.final_amount;

      // Determine correct status
      let newStatus = bill.status;
      let newBalance = bill.balance_amount;
      let paymentDate = null;

      if (totalPaid >= billAmount) {
        newStatus = 'paid';
        newBalance = 0;
        paymentDate = new Date().toISOString();
      } else if (totalPaid > 0) {
        newStatus = 'partially_paid';
        newBalance = billAmount - totalPaid;
      } else {
        newStatus = 'unpaid';
        newBalance = billAmount;
      }

      // Update bill if status or balance doesn't match
      if (newStatus !== bill.status || newBalance !== bill.balance_amount) {
        logger.info('billing/receipts', 'Updating bill status', {
          billId: bill.id,
          oldStatus: bill.status,
          newStatus,
          oldBalance: bill.balance_amount,
          newBalance
        });

        const updateData: Record<string, unknown> = {
          status: newStatus,
          balance_amount: newBalance,
          updated_at: new Date().toISOString()
        };

        if (paymentDate) {
          updateData.payment_date = paymentDate;
        }

        const { error: updateError } = await client
          .from('billing_student_bills')
          .update(updateData)
          .eq('id', billId);

        if (updateError) {
          logger.error('billing/receipts', 'Error updating bill status manually', updateError);
        } else {
          logger.info('billing/receipts', 'Bill status updated successfully', { billId, newStatus });
        }
      }
    } catch (error) {
      logger.error('billing/receipts', 'Error in validateAndUpdateBillStatus', error);
    }
  }

  // Method to check if a bill is now fully paid and generate an invoice if needed
  private static async checkAndGenerateInvoice(
    billId: string,
    supabaseClient?: SupabaseClient
  ): Promise<void> {
    const client = this.getClient(supabaseClient);

    try {
      // Get current bill details with related data
      const { data: bill, error: billError } = await client
        .from('billing_student_bills')
        .select(
          `
          id,
          final_amount,
          status,
          balance_amount,
          student_id,
          institution_id,
          bill_description,
          payment_date
        `
        )
        .eq('id', billId)
        .single();

      if (billError || !bill) {
        logger.error('billing/receipts', 'Error fetching bill for invoice generation', billError);
        return;
      }

      // Check if bill is now fully paid
      if (bill.status === 'paid' && bill.balance_amount === 0) {
        logger.info('billing/receipts', 'Bill is fully paid, checking for invoice generation', { billId });

        // Check if invoice already exists for this bill
        const { data: existingInvoices, error: invoiceError } =
          await client
            .from('billing_invoices')
            .select(
              `
            id,
            invoice_items:billing_invoice_items(
              receipt_id,
              receipt:billing_receipts(
                receipt_items:billing_receipt_items(bill_id)
              )
            )
          `
            )
            .eq('student_id', bill.student_id);

        if (invoiceError) {
          logger.error('billing/receipts', 'Error checking existing invoices', invoiceError);
          return;
        }

        // Check if any existing invoice contains this bill
        const billAlreadyInvoiced = existingInvoices?.some((invoice) =>
          invoice.invoice_items?.some((item) =>
            (item.receipt as any)?.receipt_items?.some(
              (ri: any) => ri.bill_id === billId
            )
          )
        );

        if (billAlreadyInvoiced) {
          logger.info('billing/receipts', 'Bill already has an invoice, skipping auto-generation', { billId });
          return;
        }

        // Get all receipts that paid for this bill
        const { data: receiptItems, error: receiptError } = await client
          .from('billing_receipt_items')
          .select(
            `
            amount_paid,
            receipt_id,
            receipt:billing_receipts(
              id,
              receipt_number,
              payment_amount,
              payment_paid_date
            )
          `
          )
          .eq('bill_id', billId);

        if (receiptError || !receiptItems || receiptItems.length === 0) {
          logger.error('billing/receipts', 'Error fetching receipt items for invoice', receiptError);
          return;
        }

        // Calculate total amount and create invoice items
        const invoiceItems = receiptItems.map((item) => ({
          receipt_id: item.receipt_id,
          amount: item.amount_paid
        }));

        // Use database function to generate invoice (preferred method)
        try {
          await client.rpc('generate_auto_invoice_for_bill', {
            p_bill_id: billId
          });
          logger.info('billing/receipts', 'Auto-generated invoice using database function', { billId });
        } catch (dbError) {
          logger.warn('billing/receipts', 'Database auto-invoice function failed, using fallback', dbError);

          // Fallback: Create invoice using service
          const { BillingInvoiceService } = await import(
            '../invoices/billing-invoice-service'
          );

          const invoiceData = {
            invoice_type: 'individual' as const,
            student_id: bill.student_id,
            institution_id: bill.institution_id,
            invoice_description: `Payment Invoice for: ${bill.bill_description}`,
            payment_terms: 'Payment completed',
            due_date: new Date().toISOString().split('T')[0],
            additional_charges: 0,
            discount_applied: 0,
            invoice_items: invoiceItems
          };

          await BillingInvoiceService.createBillingInvoice(invoiceData);
          logger.info('billing/receipts', 'Auto-generated invoice using service fallback', { billId });
        }
      }
    } catch (error) {
      logger.error('billing/receipts', 'Error in checkAndGenerateInvoice', error);
      // Don't throw error to avoid breaking the main payment flow
    }
  }
}
