import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingInvoice,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilters,
  InvoiceListResponse,
  BulkOperationResult
} from '@/types/billing-schedule';

export class BillingInvoiceServiceOptimized {
  private static supabase = createClientSupabaseClient();

  // Generate invoice number with error handling
  private static async generateInvoiceNumber(): Promise<string> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'generate_invoice_number'
      );

      if (error) {
        console.error('Error generating invoice number:', error);
        throw new Error('Failed to generate invoice number');
      }

      return data;
    } catch (error) {
      console.error('Error in generateInvoiceNumber:', error);
      // Fallback to timestamp-based approach
      const now = new Date();
      const timestamp = now.getTime().toString().slice(-8);
      return `INV-${timestamp}`;
    }
  }

  // Optimized method to get single invoice with progressive loading
  static async getBillingInvoice(id: string): Promise<BillingInvoice> {
    try {
      // Step 1: Get basic invoice data
      const { data: invoice, error: invoiceError } = await this.supabase
        .from('billing_invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (invoiceError) {
        throw new Error(`Failed to fetch invoice: ${invoiceError.message}`);
      }

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Step 2: Get related data in parallel (much faster than nested joins)
      const [studentResult, institutionResult, invoiceItemsResult] =
        await Promise.allSettled([
          // Get student data
          this.supabase
            .from('learners_profiles')
            .select('id, first_name, last_name, roll_number, college_email')
            .eq('id', (invoice as any).student_id)
            .single(),

          // Get institution data
          this.supabase
            .from('institutions')
            .select('id, name, counselling_code')
            .eq('id', (invoice as any).institution_id)
            .single(),

          // Get invoice items
          this.supabase
            .from('billing_invoice_items')
            .select('id, receipt_id, amount')
            .eq('invoice_id', id)
        ]);

      // Step 3: Process results with fallback handling
      const student =
        studentResult.status === 'fulfilled' && !studentResult.value.error
          ? studentResult.value.data
          : null;

      const institution =
        institutionResult.status === 'fulfilled' &&
        !institutionResult.value.error
          ? institutionResult.value.data
          : null;

      const invoiceItems =
        invoiceItemsResult.status === 'fulfilled' &&
        !invoiceItemsResult.value.error
          ? invoiceItemsResult.value.data || []
          : [];

      // Step 4: Get receipt data for invoice items (if any)
      let enrichedInvoiceItems: any[] = invoiceItems;
      if (invoiceItems.length > 0) {
        const receiptIds = invoiceItems.map((item: any) => item.receipt_id);
        const { data: receipts } = await this.supabase
          .from('billing_receipts')
          .select(
            'id, receipt_number, payment_amount, payment_mode, receipt_date'
          )
          .in('id', receiptIds);

        // Map receipts to invoice items
        enrichedInvoiceItems = invoiceItems.map((item: any) => ({
          ...item,
          receipt:
            receipts?.find((receipt: any) => receipt.id === item.receipt_id) || null
        })) as any[];
      }

      // Step 5: Return complete invoice object
      return {
        ...(invoice as any),
        student,
        institution,
        invoice_items: enrichedInvoiceItems
      } as BillingInvoice;
    } catch (error) {
      console.error('Error in getBillingInvoice (optimized):', error);
      throw error;
    }
  }

  // Optimized method to get invoices list with better query strategy
  static async getBillingInvoices(
    filters: InvoiceFilters = {}
  ): Promise<InvoiceListResponse> {
    try {
      // Step 1: Build base query for invoices only
      let query = (this.supabase as any).from('billing_invoices').select('*');

      // Apply filters to base query
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

      // Get total count efficiently
      const countQuery = this.supabase
        .from('billing_invoices')
        .select('*', { count: 'exact', head: true });

      // Apply same filters to count query
      if (filters.search) {
        countQuery.or(
          `invoice_number.ilike.%${filters.search}%,invoice_description.ilike.%${filters.search}%`
        );
      }
      if (filters.student_id) countQuery.eq('student_id', filters.student_id);
      if (filters.institution_id)
        countQuery.eq('institution_id', filters.institution_id);
      if (filters.invoice_type)
        countQuery.eq('invoice_type', filters.invoice_type);
      if (filters.invoice_date_from)
        countQuery.gte('invoice_date', filters.invoice_date_from);
      if (filters.invoice_date_to)
        countQuery.lte('invoice_date', filters.invoice_date_to);

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      // Execute queries in parallel
      const [invoicesResult, countResult] = await Promise.allSettled([
        query,
        countQuery
      ]);

      if (invoicesResult.status === 'rejected') {
        throw new Error('Failed to fetch invoices');
      }

      const invoices = invoicesResult.value.data || [];
      const total =
        countResult.status === 'fulfilled' ? countResult.value.count || 0 : 0;

      // Step 2: Get related data for the fetched invoices
      if (invoices.length > 0) {
        const studentIds = [...new Set(invoices.map((inv: any) => inv.student_id))] as string[];
        const institutionIds = [
          ...new Set(invoices.map((inv: any) => inv.institution_id))
        ] as string[];
        const invoiceIds = invoices.map((inv: any) => inv.id) as string[];

        // Fetch related data in parallel
        const [studentsResult, institutionsResult, invoiceItemsResult] =
          await Promise.allSettled([
            this.supabase
              .from('learners_profiles')
              .select('id, first_name, last_name, roll_number, college_email')
              .in('id', studentIds),

            this.supabase
              .from('institutions')
              .select('id, name, counselling_code')
              .in('id', institutionIds),

            this.supabase
              .from('billing_invoice_items')
              .select('invoice_id, id, receipt_id, amount')
              .in('invoice_id', invoiceIds)
          ]);

        const students =
          studentsResult.status === 'fulfilled'
            ? studentsResult.value.data || []
            : [];
        const institutions =
          institutionsResult.status === 'fulfilled'
            ? institutionsResult.value.data || []
            : [];
        const invoiceItems =
          invoiceItemsResult.status === 'fulfilled'
            ? invoiceItemsResult.value.data || []
            : [];

        // Get receipts for invoice items
        let receipts: any[] = [];
        if (invoiceItems.length > 0) {
          const receiptIds = [
            ...new Set(invoiceItems.map((item: any) => item.receipt_id))
          ];
          const receiptsResult = await this.supabase
            .from('billing_receipts')
            .select('id, receipt_number, payment_amount')
            .in('id', receiptIds);

          receipts = receiptsResult.data || [];
        }

        // Step 3: Combine data efficiently
        const enrichedInvoices = invoices.map((invoice: any) => ({
          ...invoice,
          student: students.find((s: any) => s.id === invoice.student_id) || null,
          institution:
            institutions.find((i: any) => i.id === invoice.institution_id) || null,
          invoice_items: invoiceItems
            .filter((item: any) => item.invoice_id === invoice.id)
            .map((item: any) => ({
              ...item,
              receipt: receipts.find((r: any) => r.id === item.receipt_id) || null
            }))
        }));

        return {
          data: enrichedInvoices,
          metadata: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          }
        };
      }

      return {
        data: [],
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error in getBillingInvoices (optimized):', error);
      throw error;
    }
  }

  // Create invoice with better error handling
  static async createBillingInvoice(
    invoiceData: CreateInvoiceDto
  ): Promise<BillingInvoice> {
    try {
      const invoiceNumber = await this.generateInvoiceNumber();

      const { data, error } = await (this.supabase
        .from('billing_invoices') as any)
        .insert({
          ...invoiceData,
          invoice_number: invoiceNumber
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating invoice:', error);
        throw new Error(`Failed to create invoice: ${error.message}`);
      }

      // Create invoice items if provided
      if (invoiceData.invoice_items && invoiceData.invoice_items.length > 0) {
        const invoiceItems = invoiceData.invoice_items.map((item) => ({
          ...item,
          invoice_id: (data as any).id
        }));

        const { error: itemsError } = await (this.supabase
          .from('billing_invoice_items') as any)
          .insert(invoiceItems);

        if (itemsError) {
          console.error('Error creating invoice items:', itemsError);
          // Don't throw here, invoice was created successfully
        }
      }

      // Return the created invoice with full details
      return await this.getBillingInvoice((data as any).id);
    } catch (error) {
      console.error('Error in createBillingInvoice:', error);
      throw error;
    }
  }

  // Update invoice with optimized refetch
  static async updateBillingInvoice(
    id: string,
    invoiceData: UpdateInvoiceDto
  ): Promise<BillingInvoice> {
    try {
      const { data, error } = await (this.supabase
        .from('billing_invoices') as any)
        .update(invoiceData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating invoice:', error);
        throw new Error(`Failed to update invoice: ${error.message}`);
      }

      // Return updated invoice with full details
      return await this.getBillingInvoice(id);
    } catch (error) {
      console.error('Error in updateBillingInvoice:', error);
      throw error;
    }
  }

  // Delete invoice with proper cleanup
  static async deleteBillingInvoice(id: string): Promise<void> {
    try {
      // Delete invoice items first (foreign key constraint)
      const { error: itemsError } = await this.supabase
        .from('billing_invoice_items')
        .delete()
        .eq('invoice_id', id);

      if (itemsError) {
        console.error('Error deleting invoice items:', itemsError);
        // Continue with invoice deletion even if items deletion fails
      }

      // Delete the invoice
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

  // Optimized method for bulk operations
  static async bulkCreateInvoices(
    invoices: CreateInvoiceDto[]
  ): Promise<BulkOperationResult> {
    const results: BulkOperationResult = {
      success: [],
      failed: []
    };

    // Process in chunks to avoid overwhelming the database
    const chunkSize = 10;
    for (let i = 0; i < invoices.length; i += chunkSize) {
      const chunk = invoices.slice(i, i + chunkSize);

      const chunkResults = await Promise.allSettled(
        chunk.map((invoice) => this.createBillingInvoice(invoice))
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.success.push(result.value.id);
        } else {
          results.failed.push({
            id: chunk[index].student_id || `invoice_${i + index}`,
            error: result.reason.message || 'Unknown error'
          });
        }
      });
    }

    return results;
  }

  // Method to get invoices by student (optimized)
  static async getInvoicesByStudent(
    studentId: string
  ): Promise<BillingInvoice[]> {
    try {
      const response = await this.getBillingInvoices({
        student_id: studentId,
        limit: 100 // Reasonable limit for student invoices
      });

      return response.data;
    } catch (error) {
      console.error('Error getting invoices by student:', error);
      throw error;
    }
  }

  // Method to check if bill has auto-generated invoice (optimized)
  static async getBillAutoInvoice(
    billId: string
  ): Promise<BillingInvoice | null> {
    try {
      // First, find receipts that paid this bill
      const { data: receiptItems, error: receiptItemsError } =
        await this.supabase
          .from('billing_receipt_items')
          .select('receipt_id')
          .eq('bill_id', billId);

      if (receiptItemsError || !receiptItems?.length) {
        return null;
      }

      const receiptIds = receiptItems.map((item: any) => item.receipt_id);

      // Find invoice items that reference these receipts
      const { data: invoiceItems, error: invoiceItemsError } =
        await this.supabase
          .from('billing_invoice_items')
          .select('invoice_id')
          .in('receipt_id', receiptIds);

      if (invoiceItemsError || !invoiceItems?.length) {
        return null;
      }

      const invoiceId = (invoiceItems[0] as any).invoice_id;

      // Get the full invoice details
      return await this.getBillingInvoice(invoiceId);
    } catch (error) {
      console.error('Error checking bill auto-invoice:', error);
      return null;
    }
  }

  // Method to get auto-generated invoices (optimized)
  static async getAutoGeneratedInvoices(
    institutionId?: string
  ): Promise<BillingInvoice[]> {
    try {
      const response = await this.getBillingInvoices({
        institution_id: institutionId,
        invoice_type: 'individual',
        search: 'Payment Invoice for:', // Search in description
        limit: 100
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching auto-generated invoices:', error);
      return [];
    }
  }

  // Additional utility methods
  static async sendInvoice(id: string, email: string): Promise<void> {
    // Email integration pending: Requires email provider (e.g., Resend, SendGrid).
    // When ready, call EmailService.sendInvoice(invoice) here.
    // See: https://resend.com/docs for recommended provider.
    console.info('[billing/invoices] Invoice email not sent — email provider not configured', {
      invoiceId: id,
      recipientEmail: email,
    });
  }

  static async downloadInvoicePDF(id: string): Promise<void> {
    // PDF generation pending: Requires a PDF library (e.g., @react-pdf/renderer, jsPDF, Puppeteer).
    // When ready, generate PDF from invoice HTML and trigger browser download.
    // See: https://react-pdf.org/ for recommended approach in Next.js.
    console.info('[billing/invoices] PDF download not available — PDF generator not configured', {
      invoiceId: id,
    });
  }
}
