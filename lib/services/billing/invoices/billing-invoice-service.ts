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
    const { data, error } = await (this.supabase as any).rpc('generate_invoice_number');

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
      const { data: invoice, error: invoiceError } = await (this.supabase
        .from('billing_invoices') as any)
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
          invoice_id: (invoice as any).id,
          receipt_id: item.receipt_id,
          amount: item.amount
        }));

        const { error: itemsError } = await (this.supabase
          .from('billing_invoice_items') as any)
          .insert(invoiceItems);

        if (itemsError) {
          console.error('Error creating invoice items:', itemsError);
          throw new Error(
            `Failed to create invoice items: ${itemsError.message}`
          );
        }
      }

      return await this.getBillingInvoice((invoice as any).id);
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
      const { data, error } = await (this.supabase
        .from('billing_invoices') as any)
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

  // Get invoices with filters and pagination (optimized: single query with count)
  static async getBillingInvoices(
    filters: InvoiceFilters = {}
  ): Promise<InvoiceListResponse> {
    try {
      // Single query with count included (eliminates separate count query)
      let query = (this.supabase as any).from('billing_invoices').select(
        `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email
          ),
          institution:institutions!fk_billing_invoices_institution(
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
        `,
        { count: 'exact' }
      );

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

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data, count, error } = await query;

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

  // Get single invoice (optimized: single query with fallback)
  static async getBillingInvoice(id: string): Promise<BillingInvoice> {
    try {
      // Single optimized query with all relations
      const { data, error } = await this.supabase
        .from('billing_invoices')
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email
          ),
          institution:institutions!fk_billing_invoices_institution(
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
        // If complex query fails, try simple query as fallback
        const { data: simpleData, error: simpleError } = await this.supabase
          .from('billing_invoices')
          .select('*')
          .eq('id', id)
          .single();

        if (simpleError) {
          throw new Error(`Failed to fetch invoice: ${simpleError.message}`);
        }

        if (!simpleData) {
          throw new Error('Invoice not found');
        }

        // Return simple data with empty relations
        return {
          ...(simpleData as any),
          student: null,
          institution: null,
          invoice_items: []
        } as BillingInvoice;
      }

      if (!data) {
        throw new Error('Invoice not found');
      }

      return data as unknown as BillingInvoice;
    } catch (error) {
      console.error('Error in getBillingInvoice:', error);
      throw error;
    }
  }

  // Send invoice via email
  static async sendInvoice(id: string, email: string): Promise<void> {
    try {
      const invoice = await this.getBillingInvoice(id);

      // Generate HTML content for the invoice
      const invoiceHTML = this.generateInvoiceHTML(invoice);

      // Generate email content
      const emailSubject = `Invoice ${invoice.invoice_number} - ${invoice.institution?.name}`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
            Invoice Notification
          </h2>
          
          <p>Dear ${invoice.student?.first_name || ''} ${invoice.student?.last_name || ''},</p>
          
          <p>Please find attached your invoice with the following details:</p>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
            <p><strong>Invoice Date:</strong> ${new Date(
              invoice.invoice_date
            ).toLocaleDateString('en-IN')}</p>
            <p><strong>Amount:</strong> ${new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR'
            }).format(invoice.grand_total)}</p>
            ${
              invoice.due_date
                ? `<p><strong>Due Date:</strong> ${new Date(
                    invoice.due_date
                  ).toLocaleDateString('en-IN')}</p>`
                : ''
            }
          </div>
          
          ${
            invoice.payment_terms
              ? `
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <h4 style="margin: 0 0 10px 0; color: #856404;">Payment Terms:</h4>
              <p style="margin: 0; color: #856404;">${invoice.payment_terms}</p>
            </div>
          `
              : ''
          }
          
          <p>The complete invoice is attached below for your reference.</p>
          
          <p>If you have any questions regarding this invoice, please contact our billing department.</p>
          
          <p>Thank you,<br>
          <strong>${invoice.institution?.name}</strong></p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e9ecef;">
          
          <div style="color: #666; font-size: 12px;">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>Invoice generated on: ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
        
        <hr style="margin: 40px 0;">
        
        <!-- Invoice HTML Content -->
        ${invoiceHTML}
      `;

      // In a real implementation, you would use an email service like:
      // - Supabase Edge Functions with email service
      // - SendGrid, Mailgun, AWS SES, etc.
      // - SMTP configuration

      // Email integration pending: Requires email provider (e.g., Resend, SendGrid).
      // When ready, call EmailService.sendInvoice(invoice) here.
      // See: https://resend.com/docs for recommended provider.
      //
      // Example with Supabase Edge Functions:
      //   const { error } = await supabase.functions.invoke('send-email', {
      //     body: { to: email, subject: emailSubject, html: emailBody }
      //   });
      console.info('[billing/invoices] Invoice email not sent — email provider not configured', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        recipientEmail: email,
      });
    } catch (error) {
      console.error('Error sending invoice:', error);
      throw error;
    }
  }

  // Download invoice as PDF
  static async downloadInvoicePDF(id: string): Promise<void> {
    try {
      const invoice = await this.getBillingInvoice(id);

      // Generate HTML content for the invoice
      const htmlContent = this.generateInvoiceHTML(invoice);

      // Create a blob with the HTML content
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.invoice_number}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      window.URL.revokeObjectURL(url);

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

    const subtotal =
      invoice.invoice_items?.reduce((sum, item) => sum + item.amount, 0) || 0;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              max-width: 800px; 
              margin: 0 auto; 
              padding: 20px;
              background: #fff;
            }
            .header { 
              border-bottom: 3px solid #2563eb; 
              padding-bottom: 20px; 
              margin-bottom: 30px; 
              text-align: center;
            }
            .header h1 { 
              color: #2563eb; 
              font-size: 2.5em; 
              font-weight: 300; 
              margin-bottom: 10px;
              letter-spacing: 2px;
            }
            .header .institution { 
              font-size: 1.5em; 
              color: #666; 
              margin-bottom: 5px;
            }
            .header .invoice-number { 
              font-size: 1.1em; 
              color: #2563eb; 
              font-weight: 600;
            }
            .invoice-meta { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 30px; 
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
            }
            .invoice-meta .section { flex: 1; }
            .invoice-meta .section:not(:last-child) { margin-right: 30px; }
            .invoice-meta h3 { 
              color: #2563eb; 
              margin-bottom: 10px; 
              font-size: 1.1em;
              border-bottom: 1px solid #e9ecef;
              padding-bottom: 5px;
            }
            .invoice-meta p { margin-bottom: 5px; color: #555; }
            .invoice-meta .label { font-weight: 600; color: #333; }
            .items-section { margin-bottom: 30px; }
            .items-table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px;
              background: #fff;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              border-radius: 8px;
              overflow: hidden;
            }
            .items-table th { 
              background: #2563eb; 
              color: white; 
              padding: 15px; 
              text-align: left;
              font-weight: 600;
              text-transform: uppercase;
              font-size: 0.9em;
              letter-spacing: 1px;
            }
            .items-table td { 
              padding: 15px; 
              border-bottom: 1px solid #e9ecef;
            }
            .items-table tr:last-child td { border-bottom: none; }
            .items-table tr:nth-child(even) { background: #f8f9fa; }
            .items-table .amount { 
              text-align: right; 
              font-weight: 600; 
              color: #2563eb;
            }
            .totals-section { 
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 30px;
            }
            .total-row { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 10px;
              padding: 5px 0;
            }
            .total-row.subtotal { 
              font-size: 1.1em;
              padding-top: 15px;
              border-top: 1px solid #e9ecef;
            }
            .total-row.grand-total { 
              font-size: 1.3em; 
              font-weight: bold; 
              background: #2563eb;
              color: white;
              padding: 15px;
              margin: 20px -20px -20px -20px;
              border-radius: 0 0 8px 8px;
            }
            .total-row .amount { color: #2563eb; font-weight: 600; }
            .total-row.grand-total .amount { color: white; }
            .additional-info { 
              margin-top: 30px;
              padding: 20px;
              background: #f8f9fa;
              border-radius: 8px;
              border-left: 4px solid #2563eb;
            }
            .additional-info h3 { 
              color: #2563eb; 
              margin-bottom: 10px;
            }
            .additional-info p { 
              color: #555; 
              line-height: 1.6;
            }
            .footer { 
              text-align: center; 
              margin-top: 40px; 
              padding-top: 20px;
              border-top: 1px solid #e9ecef;
              color: #666; 
              font-size: 0.9em;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 0.85em;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .status-individual { background: #e3f2fd; color: #1976d2; }
            .status-consolidated { background: #f3e5f5; color: #7b1fa2; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVOICE</h1>
            <div class="institution">${
              invoice.institution?.name || 'Institution Name'
            }</div>
            <div class="invoice-number">Invoice #${invoice.invoice_number}</div>
          </div>
          
          <div class="invoice-meta">
            <div class="section">
              <h3>Invoice Details</h3>
              <p><span class="label">Date:</span> ${formatDate(
                invoice.invoice_date
              )}</p>
              <p><span class="label">Type:</span> 
                <span class="status-badge status-${invoice.invoice_type}">
                  ${invoice.invoice_type}
                </span>
              </p>
              ${
                invoice.due_date
                  ? `<p><span class="label">Due Date:</span> ${formatDate(
                      invoice.due_date
                    )}</p>`
                  : ''
              }
              ${
                invoice.billing_period_from
                  ? `
                <p><span class="label">Billing Period:</span><br>
                ${formatDate(invoice.billing_period_from)} - ${formatDate(
                      invoice.billing_period_to || invoice.billing_period_from
                    )}
                </p>
              `
                  : ''
              }
            </div>

            <div class="section">
              <h3>Bill To</h3>
              <p><span class="label">Student:</span> ${
                `${invoice.student?.first_name || 'N/A'} ${invoice.student?.last_name || ''}`
              }</p>
              ${
                invoice.student?.roll_number
                  ? `<p><span class="label">Roll Number:</span> ${invoice.student.roll_number}</p>`
                  : ''
              }
              ${
                invoice.student?.college_email
                  ? `<p><span class="label">Email:</span> ${invoice.student.college_email}</p>`
                  : ''
              }
              ${
                invoice.institution?.counselling_code
                  ? `<p><span class="label">Institution Code:</span> ${invoice.institution.counselling_code}</p>`
                  : ''
              }
            </div>
          </div>

          ${
            invoice.invoice_description
              ? `
            <div class="additional-info">
              <h3>Description</h3>
              <p>${invoice.invoice_description}</p>
            </div>
          `
              : ''
          }

          <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th>Receipt Number</th>
                  <th>Payment Details</th>
                  <th class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
                ${
                  invoice.invoice_items
                ?.map(
                  (item) => `
                <tr>
                    <td>
                      <strong>#${item.receipt?.receipt_number || 'N/A'}</strong>
                    </td>
                    <td>
                      Total Receipt Amount: ${formatCurrency(
                        item.receipt?.payment_amount || 0
                      )}
                      <br>
                      <small style="color: #666;">Invoice Item Amount</small>
                    </td>
                    <td class="amount">${formatCurrency(item.amount)}</td>
                </tr>
              `
                )
                    .join('') ||
                  `
                  <tr>
                    <td colspan="3" style="text-align: center; color: #666; padding: 30px;">
                      No items found for this invoice
                    </td>
                  </tr>
                `
                }
            </tbody>
          </table>
          </div>

          <div class="totals-section">
            <div class="total-row subtotal">
              <span>Subtotal:</span>
              <span class="amount">${formatCurrency(subtotal)}</span>
            </div>

            ${
              invoice.additional_charges > 0
                ? `
              <div class="total-row">
                <span>Additional Charges:</span>
                <span class="amount">+${formatCurrency(
                    invoice.additional_charges
                )}</span>
              </div>
            `
                : ''
            }

            ${
              invoice.discount_applied > 0
                ? `
              <div class="total-row">
                <span>Discount Applied:</span>
                <span class="amount" style="color: #dc3545;">-${formatCurrency(
                    invoice.discount_applied
                )}</span>
              </div>
            `
                : ''
            }

            <div class="total-row grand-total">
              <span>Grand Total:</span>
              <span class="amount">${formatCurrency(invoice.grand_total)}</span>
            </div>
          </div>

          ${
            invoice.payment_terms
              ? `
            <div class="additional-info">
              <h3>Payment Terms</h3>
              <p>${invoice.payment_terms}</p>
            </div>
          `
              : ''
          }

          ${
            invoice.tax_summary
              ? `
            <div class="additional-info">
              <h3>Tax Summary</h3>
              <p>${invoice.tax_summary}</p>
            </div>
          `
              : ''
          }

          <div class="footer">
            <p>This is a computer-generated invoice.</p>
            <p>Generated on: ${new Date().toLocaleString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
            <p style="margin-top: 10px; font-size: 0.8em; color: #999;">
              For any queries regarding this invoice, please contact the billing department.
            </p>
          </div>
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
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email
          ),
          institution:institutions!fk_billing_invoices_institution(
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
        `
        )
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as BillingInvoice[];
    } catch (error) {
        console.error('Error fetching student invoices:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch student invoices'
      );
    }
  }

  // Method to check if a bill already has an auto-generated invoice
  static async getBillAutoInvoice(
    billId: string
  ): Promise<BillingInvoice | null> {
    try {
      const { data, error } = await this.supabase
        .from('billing_invoices')
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email
          ),
          institution:institutions!fk_billing_invoices_institution(
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
              receipt_items:billing_receipt_items(
                bill_id
              )
            )
          )
        `
        )
        .eq('invoice_type', 'individual')
        .contains('invoice_description', `Payment Invoice for:`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Find invoice that contains the specific bill
      const invoice = data?.find((inv: any) =>
        inv.invoice_items?.some((item: any) =>
          item.receipt?.receipt_items?.some((ri: any) => ri.bill_id === billId)
        )
      );

      return (invoice as unknown as BillingInvoice) || null;
    } catch (error) {
      console.error('Error checking bill auto-invoice:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to check bill auto-invoice'
      );
    }
  }

  // Method to get all auto-generated invoices
  static async getAutoGeneratedInvoices(
    institutionId?: string
  ): Promise<BillingInvoice[]> {
    try {
      let query = this.supabase
        .from('billing_invoices')
        .select(
          `
          *,
          student:learners_profiles(
            id,
            first_name,
            last_name,
            roll_number,
            student_email
          ),
          institution:institutions!fk_billing_invoices_institution(
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
        `
        )
        .eq('invoice_type', 'individual')
        .ilike('invoice_description', 'Payment Invoice for:%')
        .order('created_at', { ascending: false });

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as BillingInvoice[];
    } catch (error) {
      console.error('Error fetching auto-generated invoices:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch auto-generated invoices'
      );
    }
  }
}
