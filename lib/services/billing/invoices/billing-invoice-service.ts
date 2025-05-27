import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingInvoice,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilters,
  InvoiceListResponse,
  BulkOperationResult
} from '@/types/billing-schedule';

export class BillingInvoiceService {
  private static supabase = createClientSupabaseClient();

  // Generate invoice number
  private static async generateInvoiceNumber(): Promise<string> {
    const { data, error } = await this.supabase.rpc('generate_invoice_number');

    if (error) {
      console.error('Error generating invoice number:', error);
      throw new Error('Failed to generate invoice number');
    }

    return data;
  }

  // Create invoice
  static async createBillingInvoice(
    invoiceData: CreateInvoiceDto
  ): Promise<BillingInvoice> {
    try {
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate grand total
      const grandTotal =
        invoiceData.invoice_items.reduce((sum, item) => sum + item.amount, 0) +
        (invoiceData.additional_charges || 0) -
        (invoiceData.discount_applied || 0);

      // Create invoice record
      const { data: invoice, error: invoiceError } = await this.supabase
        .from('billing_invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_type: invoiceData.invoice_type,
          invoice_date: new Date().toISOString().split('T')[0],
          student_id: invoiceData.student_id,
          institution_id: invoiceData.institution_id,
          billing_period_from: invoiceData.billing_period_from,
          billing_period_to: invoiceData.billing_period_to,
          invoice_description: invoiceData.invoice_description,
          tax_summary: invoiceData.tax_summary,
          payment_terms: invoiceData.payment_terms,
          due_date: invoiceData.due_date,
          additional_charges: invoiceData.additional_charges || 0,
          discount_applied: invoiceData.discount_applied || 0,
          grand_total: grandTotal,
          created_by: (await this.supabase.auth.getUser()).data.user?.id
        })
        .select('*')
        .single();

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        throw new Error(`Failed to create invoice: ${invoiceError.message}`);
      }

      // Create invoice items
      if (invoiceData.invoice_items.length > 0) {
        const invoiceItems = invoiceData.invoice_items.map((item) => ({
          invoice_id: invoice.id,
          receipt_id: item.receipt_id,
          amount: item.amount
        }));

        const { error: itemsError } = await this.supabase
          .from('billing_invoice_items')
          .insert(invoiceItems);

        if (itemsError) {
          console.error('Error creating invoice items:', itemsError);
          throw new Error(
            `Failed to create invoice items: ${itemsError.message}`
          );
        }
      }

      return await this.getBillingInvoice(invoice.id);
    } catch (error) {
      console.error('Error in createBillingInvoice:', error);
      throw error;
    }
  }

  // Update invoice
  static async updateBillingInvoice(
    id: string,
    invoiceData: UpdateInvoiceDto
  ): Promise<BillingInvoice> {
    try {
      const { data, error } = await this.supabase
        .from('billing_invoices')
        .update({
          invoice_type: invoiceData.invoice_type,
          invoice_date: invoiceData.invoice_date,
          student_id: invoiceData.student_id,
          institution_id: invoiceData.institution_id,
          billing_period_from: invoiceData.billing_period_from,
          billing_period_to: invoiceData.billing_period_to,
          invoice_description: invoiceData.invoice_description,
          tax_summary: invoiceData.tax_summary,
          payment_terms: invoiceData.payment_terms,
          due_date: invoiceData.due_date,
          additional_charges: invoiceData.additional_charges,
          discount_applied: invoiceData.discount_applied,
          grand_total: invoiceData.grand_total,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating invoice:', error);
        throw new Error(`Failed to update invoice: ${error.message}`);
      }

      return await this.getBillingInvoice(id);
    } catch (error) {
      console.error('Error in updateBillingInvoice:', error);
      throw error;
    }
  }

  // Delete invoice
  static async deleteBillingInvoice(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_invoices')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting invoice:', error);
        throw new Error(`Failed to delete invoice: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in deleteBillingInvoice:', error);
      throw error;
    }
  }

  // Get invoices with filters and pagination
  static async getBillingInvoices(
    filters: InvoiceFilters = {}
  ): Promise<InvoiceListResponse> {
    try {
      let query = this.supabase.from('billing_invoices').select(`
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
          invoice_items:billing_invoice_items(
            id,
            receipt_id,
            amount,
            receipt:billing_receipts(
              id,
              receipt_number,
              payment_amount
            )
          )
        `);

      // Apply filters
      if (filters.search) {
        query = query.or(
          `invoice_number.ilike.%${filters.search}%,invoice_description.ilike.%${filters.search}%`
        );
      }

      if (filters.student_id) {
        query = query.eq('student_id', filters.student_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.invoice_type) {
        query = query.eq('invoice_type', filters.invoice_type);
      }

      if (filters.invoice_date_from) {
        query = query.gte('invoice_date', filters.invoice_date_from);
      }

      if (filters.invoice_date_to) {
        query = query.lte('invoice_date', filters.invoice_date_to);
      }

      if (filters.billing_period_from) {
        query = query.gte('billing_period_from', filters.billing_period_from);
      }

      if (filters.billing_period_to) {
        query = query.lte('billing_period_to', filters.billing_period_to);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // Get total count
      const { count } = await this.supabase
        .from('billing_invoices')
        .select('*', { count: 'exact', head: true });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching invoices:', error);
        throw new Error(`Failed to fetch invoices: ${error.message}`);
      }

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('Error in getBillingInvoices:', error);
      throw error;
    }
  }

  // Get single invoice
  static async getBillingInvoice(id: string): Promise<BillingInvoice> {
    try {
      const { data, error } = await this.supabase
        .from('billing_invoices')
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
          invoice_items:billing_invoice_items(
            id,
            receipt_id,
            amount,
            receipt:billing_receipts(
              id,
              receipt_number,
              payment_amount,
              payment_mode,
              receipt_date
            )
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching invoice:', error);
        throw new Error(`Failed to fetch invoice: ${error.message}`);
      }

      if (!data) {
        throw new Error('Invoice not found');
      }

      return data as BillingInvoice;
    } catch (error) {
      console.error('Error in getBillingInvoice:', error);
      throw error;
    }
  }

  // Send invoice via email
  static async sendInvoice(id: string, email: string): Promise<void> {
    try {
      const invoice = await this.getBillingInvoice(id);

      // TODO: Implement email sending logic
      console.log(`Sending invoice ${invoice.invoice_number} to ${email}`);

      // This would integrate with your email service
      // For now, we'll simulate the operation
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error sending invoice:', error);
      throw error;
    }
  }

  // Download invoice as PDF
  static async downloadInvoicePDF(id: string): Promise<void> {
    try {
      const invoice = await this.getBillingInvoice(id);

      // TODO: Implement PDF generation logic
      console.log(`Downloading PDF for invoice ${invoice.invoice_number}`);

      // This would integrate with your PDF generation service
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error downloading invoice PDF:', error);
      throw error;
    }
  }

  // Generate invoice HTML for PDF/email
  private static generateInvoiceHTML(invoice: BillingInvoice): string {
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
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-details { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .items-table th { background-color: #f2f2f2; }
            .total-section { text-align: right; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVOICE</h1>
            <h2>${invoice.institution?.name}</h2>
            <p>Invoice Number: ${invoice.invoice_number}</p>
            <p>Date: ${formatDate(invoice.invoice_date)}</p>
          </div>
          
          <div class="invoice-details">
            <div>
              <h3>Bill To:</h3>
              <p>${invoice.student?.student_name}</p>
              <p>Roll No: ${invoice.student?.roll_number}</p>
              <p>Email: ${invoice.student?.student_email}</p>
            </div>
            <div>
              <h3>Invoice Details:</h3>
              <p>Type: ${invoice.invoice_type}</p>
              ${
                invoice.billing_period_from
                  ? `<p>Period: ${formatDate(
                      invoice.billing_period_from
                    )} - ${formatDate(invoice.billing_period_to || '')}</p>`
                  : ''
              }
              ${
                invoice.due_date
                  ? `<p>Due Date: ${formatDate(invoice.due_date)}</p>`
                  : ''
              }
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th>Receipt Number</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.invoice_items
                ?.map(
                  (item) => `
                <tr>
                  <td>${item.receipt?.receipt_number}</td>
                  <td>${formatCurrency(item.amount)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div class="total-section">
            ${
              invoice.additional_charges > 0
                ? `<p>Additional Charges: ${formatCurrency(
                    invoice.additional_charges
                  )}</p>`
                : ''
            }
            ${
              invoice.discount_applied > 0
                ? `<p>Discount Applied: -${formatCurrency(
                    invoice.discount_applied
                  )}</p>`
                : ''
            }
            <h3>Grand Total: ${formatCurrency(invoice.grand_total)}</h3>
          </div>

          ${
            invoice.payment_terms
              ? `
            <div style="margin-top: 30px;">
              <h3>Payment Terms:</h3>
              <p>${invoice.payment_terms}</p>
            </div>
          `
              : ''
          }
        </body>
      </html>
    `;
  }

  // Bulk create invoices
  static async bulkCreateInvoices(
    invoices: CreateInvoiceDto[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    for (const invoiceData of invoices) {
      try {
        const invoice = await this.createBillingInvoice(invoiceData);
        results.success.push(invoice.id);
      } catch (error) {
        results.failed.push({
          id: `${invoiceData.student_id}-${invoiceData.invoice_type}`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  // Get invoices by student
  static async getInvoicesByStudent(
    studentId: string
  ): Promise<BillingInvoice[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_invoices')
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
          invoice_items:billing_invoice_items(
            id,
            receipt_id,
            amount
          )
        `
        )
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching student invoices:', error);
        throw new Error(`Failed to fetch student invoices: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getInvoicesByStudent:', error);
      throw error;
    }
  }
}
