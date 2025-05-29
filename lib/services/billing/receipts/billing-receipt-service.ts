import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingReceipt,
  ReceiptFilters,
  ReceiptListResponse,
  CreateReceiptDto,
  UpdateReceiptDto,
  BulkOperationResult
} from '@/types/billing-schedule';

export class BillingReceiptService {
  private static supabase = createClientSupabaseClient();

  // Generate a unique receipt number using database function
  private static async generateReceiptNumber(): Promise<string> {
    try {
      // Use the database function for generating receipt numbers
      const { data, error } = await this.supabase.rpc(
        'generate_receipt_number'
      );

      if (error) {
        console.error('Error calling generate_receipt_number function:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Database function returned null receipt number');
      }

      console.log('Generated receipt number from database:', data);
      return data;
    } catch (error) {
      console.error('Error in generateReceiptNumber:', error);
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
      console.log('Using fallback receipt number:', fallbackNumber);
      return fallbackNumber;
    }
  }

  static async createBillingReceipt(
    receiptData: CreateReceiptDto
  ): Promise<BillingReceipt> {
    try {
      // Generate receipt number
      const receiptNumber = await this.generateReceiptNumber();

      if (!receiptNumber) {
        throw new Error('Failed to generate receipt number');
      }

      console.log('Creating receipt with number:', receiptNumber);

      // Start a transaction to create receipt and receipt items
      const { data: receipt, error: receiptError } = await this.supabase
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
          payment_remarks: receiptData.payment_remarks
        })
        .select(
          `
          *,
          student:students (
            id,
            student_name,
            roll_number,
            student_email
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
        console.error('Receipt creation error:', receiptError);
        throw receiptError;
      }

      console.log('Receipt created successfully:', receipt.id);

      // Create receipt items
      if (receiptData.receipt_items && receiptData.receipt_items.length > 0) {
        const receiptItems = receiptData.receipt_items.map((item) => ({
          receipt_id: receipt.id,
          bill_id: item.bill_id,
          amount_paid: item.amount_paid
        }));

        const { error: itemsError } = await this.supabase
          .from('billing_receipt_items')
          .insert(receiptItems);

        if (itemsError) {
          console.error('Receipt items creation error:', itemsError);
          throw itemsError;
        }

        console.log('Receipt items created successfully');
        console.log(
          'Bill statuses will be updated automatically by database trigger'
        );

        // Manual validation and update as fallback in case trigger fails
        for (const item of receiptData.receipt_items) {
          await this.validateAndUpdateBillStatus(item.bill_id);

          // Check if bill is now fully paid and generate invoice if needed
          await this.checkAndGenerateInvoice(item.bill_id);
        }
      }

      return receipt;
    } catch (error) {
      console.error('Error creating receipt:', error);
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
      const { data, error } = await this.supabase
        .from('billing_receipts')
        .update(receiptData)
        .eq('id', id)
        .select(
          `
          *,
          student:students (
            id,
            student_name,
            roll_number,
            student_email
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
      let query = this.supabase.from('billing_receipts').select(
        `
          *,
          student:students (
            id,
            student_name,
            roll_number,
            student_email
          ),
          institution:institutions (
            id,
            name,
            counselling_code
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
          student:students (
            id,
            student_name,
            roll_number,
            student_email
          ),
          institution:institutions (
            id,
            name,
            counselling_code
          ),
          receipt_items:billing_receipt_items (
            *,
            bill:billing_student_bills (*)
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
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
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        .total-row { font-weight: bold; background-color: #f9f9f9; }
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
            <span>Total Amount:</span>
            <span class="amount">${formatCurrency(
              receipt.payment_amount
            )}</span>
        </div>
    </div>

    <div class="section">
        <h3>Student Information</h3>
        <div class="info-row">
            <span>Name:</span>
            <span>${receipt.student?.student_name || 'N/A'}</span>
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
            <span>${receipt.student?.student_email || 'N/A'}</span>
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
                    <td>${item.bill?.bill_description || 'N/A'}</td>
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
            </tbody>
        </table>
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
          student:students(
            id,
            student_name,
            roll_number,
            student_email
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
      return data || [];
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
          student:students (
            id,
            student_name,
            roll_number,
            student_email,
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
    billId: string
  ): Promise<void> {
    try {
      // Get current bill details
      const { data: bill, error: billError } = await this.supabase
        .from('billing_student_bills')
        .select('id, final_amount, status, balance_amount')
        .eq('id', billId)
        .single();

      if (billError || !bill) {
        console.error('Error fetching bill for validation:', billError);
        return;
      }

      // Calculate total payments for this bill
      const { data: receiptItems, error: itemsError } = await this.supabase
        .from('billing_receipt_items')
        .select('amount_paid')
        .eq('bill_id', billId);

      if (itemsError) {
        console.error(
          'Error fetching receipt items for validation:',
          itemsError
        );
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
        console.log(
          `Manual bill status update: ${bill.id} -> ${newStatus}, Balance: ${newBalance}`
        );

        const updateData: any = {
          status: newStatus,
          balance_amount: newBalance
        };

        if (paymentDate) {
          updateData.payment_date = paymentDate;
        }

        const { error: updateError } = await this.supabase
          .from('billing_student_bills')
          .update(updateData)
          .eq('id', billId);

        if (updateError) {
          console.error('Error updating bill status manually:', updateError);
        }
      }
    } catch (error) {
      console.error('Error in validateAndUpdateBillStatus:', error);
    }
  }

  // Method to check if a bill is now fully paid and generate an invoice if needed
  private static async checkAndGenerateInvoice(billId: string): Promise<void> {
    try {
      // Get current bill details with related data
      const { data: bill, error: billError } = await this.supabase
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
        console.error('Error fetching bill for invoice generation:', billError);
        return;
      }

      // Check if bill is now fully paid
      if (bill.status === 'paid' && bill.balance_amount === 0) {
        console.log(
          `Bill ${bill.id} is now fully paid. Checking for invoice generation.`
        );

        // Check if invoice already exists for this bill
        const { data: existingInvoices, error: invoiceError } =
          await this.supabase
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
          console.error('Error checking existing invoices:', invoiceError);
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
          console.log(
            `Bill ${billId} already has an invoice. Skipping auto-generation.`
          );
          return;
        }

        // Get all receipts that paid for this bill
        const { data: receiptItems, error: receiptError } = await this.supabase
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
          console.error(
            'Error fetching receipt items for invoice:',
            receiptError
          );
          return;
        }

        // Calculate total amount and create invoice items
        const totalAmount = receiptItems.reduce(
          (sum, item) => sum + item.amount_paid,
          0
        );
        const invoiceItems = receiptItems.map((item) => ({
          receipt_id: item.receipt_id,
          amount: item.amount_paid
        }));

        // Use database function to generate invoice (preferred method)
        try {
          await this.supabase.rpc('generate_auto_invoice_for_bill', {
            p_bill_id: billId
          });
          console.log(
            `Auto-generated invoice for bill ${billId} using database function`
          );
        } catch (dbError) {
          console.warn(
            'Database auto-invoice function failed, falling back to service:',
            dbError
          );

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
          console.log(
            `Auto-generated invoice for bill ${billId} using service fallback`
          );
        }
      }
    } catch (error) {
      console.error('Error in checkAndGenerateInvoice:', error);
      // Don't throw error to avoid breaking the main payment flow
    }
  }
}
