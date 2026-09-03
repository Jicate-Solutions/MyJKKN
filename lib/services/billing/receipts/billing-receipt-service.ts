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
import { logActivityForCurrentUser, BillingActivityTemplates } from '@/lib/utils/activity-logger-client';

export class BillingReceiptService {
  private static supabase = createClientSupabaseClient();

  // Get the appropriate Supabase client (passed or default)
  private static getClient(providedClient?: SupabaseClient): any {
    return providedClient || this.supabase;
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

      // Header + items are written by fn_create_billing_receipt, which puts both
      // INSERTs in one transaction.
      //
      // This used to be: insert the header, insert the items, and if the items
      // failed, issue a compensating delete() on the header. PostgREST gives
      // each of those statements its own transaction, so that "rollback" was
      // application code — and it was itself gated by billing.receipts.delete.
      // A role holding create-but-not-delete got a silent no-op DELETE (an
      // RLS-filtered write affects zero rows without raising) and the header
      // stayed behind, settling nothing. There were 8 such orphans in
      // production, spanning 2026-05-28 to 2026-08-08.
      //
      // The RPC is SECURITY INVOKER, so RLS still decides who may write and no
      // role gains anything; only durability changed. It also generates the
      // receipt number inside the same transaction.
      const { data: created, error: rpcError } = await client.rpc(
        'fn_create_billing_receipt',
        {
          p_receipt: {
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
            created_by: currentUserId ?? null
          },
          p_items: (receiptData.receipt_items || []).map((item) => ({
            bill_id: item.bill_id,
            amount_paid: item.amount_paid
          }))
        }
      );

      if (rpcError) {
        logger.error('billing/receipts', 'Receipt creation error', rpcError);
        throw rpcError;
      }
      if (!created?.id) {
        throw new Error('Receipt creation returned no receipt');
      }

      const receiptNumber: string = created.receipt_number;

      logger.info('billing/receipts', 'Receipt created successfully', {
        receiptId: created.id,
        receiptNumber
      });

      // The bill-status trigger on billing_receipt_items has already run inside
      // that transaction; these remain as the belt-and-braces fallback and to
      // raise an invoice once a bill is fully settled.
      if (receiptData.receipt_items && receiptData.receipt_items.length > 0) {
        for (const item of receiptData.receipt_items) {
          await this.validateAndUpdateBillStatus(item.bill_id, client);

          // Check if bill is now fully paid and generate invoice if needed
          await this.checkAndGenerateInvoice(item.bill_id, client);
        }
      }

      // Callers use id and receipt_number; the rest is echoed from the input so
      // the shape stays familiar. The header is deliberately NOT read back:
      // billing_receipts SELECT is gated on billing.receipts.view, so a
      // read-back would fail for exactly the collection-only roles this path
      // now supports.
      const receipt = {
        id: created.id,
        receipt_number: receiptNumber,
        receipt_date: created.receipt_date,
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
        created_by: currentUserId,
        student: created.student_first_name
          ? {
              id: receiptData.student_id,
              first_name: created.student_first_name,
              last_name: created.student_last_name
            }
          : undefined
      } as unknown as BillingReceipt;

      trackUsage({ module: 'billing/receipts', feature: 'create_receipt', eventType: 'create' });

      const studentNameReceipt = `${receipt.student?.first_name || ''} ${receipt.student?.last_name || ''}`.trim() || 'Unknown';
      const templateReceipt = BillingActivityTemplates.receiptCreated(
        receiptNumber,
        studentNameReceipt,
        receiptData.payment_amount
      );
      logActivityForCurrentUser({
        ...templateReceipt,
        resourceId: receipt.id,
        resourceName: receiptNumber,
        institutionId: receiptData.institution_id,
        metadata: {
          sub_type: templateReceipt.sub_type,
          student_id: receiptData.student_id,
          payment_mode: receiptData.payment_mode,
          payment_amount: receiptData.payment_amount,
          bill_count: receiptData.receipt_items?.length || 0,
        },
      });

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

      const templateUpdate = BillingActivityTemplates.receiptUpdated((data as any)?.receipt_number || id);
      logActivityForCurrentUser({
        ...templateUpdate,
        resourceId: id,
        resourceName: (data as any)?.receipt_number,
        metadata: { sub_type: templateUpdate.sub_type, updated_fields: Object.keys(receiptData) },
      });

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

      const templateDelete = BillingActivityTemplates.receiptDeleted(id);
      logActivityForCurrentUser({
        ...templateDelete,
        resourceId: id,
        metadata: { sub_type: templateDelete.sub_type },
      });
    } catch (error) {
      console.error('Error deleting receipt:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete receipt'
      );
    }
  }

  /**
   * Void a mistakenly-issued receipt. Prefer this over deleteBillingReceipt:
   * the row is archived to billing_receipts_voided (with its receipt_items
   * snapshotted and a reason recorded) rather than destroyed, so the receipt
   * number stays accounted for and an auditor can still see what happened.
   *
   * The bill is reverted by the SAME path a delete uses — removing the receipt
   * cascades to billing_receipt_items, whose AFTER DELETE trigger recomputes
   * status and balance_amount — so there is one definition of "paid".
   *
   * The RPC refuses to void a receipt that has refunds, is attached to an
   * invoice, or settles a captured online payment (that last one would simply
   * be re-created by the next webhook or late-auth sweep — refund it instead).
   */
  static async voidBillingReceipt(
    id: string,
    reason: string
  ): Promise<{ receiptNumber: string; billIds: string[] }> {
    const { data, error } = await (this.supabase as any).rpc('fn_void_billing_receipt', {
      p_receipt_id: id,
      p_reason: reason,
    });

    if (error) {
      logger.error('billing/receipts', 'Failed to void receipt', { id, error });
      // Supabase errors are plain objects, not Error instances — reading
      // `.message` directly is what surfaces the RPC's RAISE EXCEPTION text
      // (e.g. "Cannot void: this receipt has refunds…") to the operator.
      throw new Error(error.message || 'Failed to void receipt');
    }

    const row = (data as Array<Record<string, any>> | null)?.[0];

    const template = BillingActivityTemplates.receiptDeleted(id);
    logActivityForCurrentUser({
      ...template,
      resourceId: id,
      metadata: { sub_type: template.sub_type, action: 'void', reason },
    });

    return {
      receiptNumber: row?.receipt_number ?? '',
      billIds: (row?.bill_ids ?? []) as string[],
    };
  }

  static async getBillingReceipts(
    filters: ReceiptFilters = {}
  ): Promise<ReceiptListResponse> {
    try {
      // Ownership filter. billing_receipts has no category of its own, so this
      // walks receipt_items -> bill -> category via chained !inner embeds, which
      // makes it "receipts containing AT LEAST ONE line of this ownership" — a
      // single payment can settle both, and a mixed receipt shows under either.
      // Only added when the filter is on, so the default list keeps its existing
      // (cheaper) query shape. Verified against PostgREST: the nested dotted
      // filter path resolves and count=exact is NOT inflated by the join.
      const ownershipEmbed = filters.collection_type
        ? `,
          collection_lines:billing_receipt_items!inner(
            bill:billing_student_bills!inner(
              category:billing_categories!inner(collection_type)
            )
          )`
        : '';

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
          )${ownershipEmbed}
        `,
        { count: 'exact' }
      );

      if (filters.collection_type) {
        query = query.eq(
          'collection_lines.bill.category.collection_type',
          filters.collection_type
        );
      }

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
              category:billing_categories(
                id,
                category_name,
                amount,
                frequency
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
      // Fetch the full receipt (items + refunds) so the PDF is complete
      // regardless of which surface initiated the download.
      const receipt = await this.getBillingReceipt(id);

      // jsPDF is browser-only and heavy — load it lazily so it stays out of
      // the initial bundle (matches lib/utils/ims-receipt-pdf.ts).
      const { downloadReceiptPdf } = await import(
        '@/lib/utils/billing/receipt-pdf'
      );
      downloadReceiptPdf(receipt);
    } catch (error) {
      console.error('Error downloading receipt PDF:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to download receipt PDF'
      );
    }
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
  /**
   * The `institution:institutions(...)` embed is what keeps the receipt form's
   * locked Institution field populated. That field is derived from the bill and
   * cannot be edited, but it used to resolve its LABEL by looking the bill's
   * institution_id up in a separately-fetched dropdown list — so any gap in
   * that list (fetch failure, `is_active = false`, RLS) rendered the locked
   * field as a bare "Select institution" placeholder the operator had no way to
   * correct. Carrying the name on the bill removes that second dependency.
   */
  static async getBillsByIds(billIds: string[]): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_student_bills')
        .select(
          `
          *,
          category:billing_categories (
            id,
            category_name,
            amount,
            frequency
          ),
          student:learners_profiles (
            id,
            first_name,
            last_name,
            roll_number,
            college_email,
            institution_id,
            student_mobile,
            father_mobile,
            mother_mobile
          ),
          institution:institutions (
            id,
            name,
            counselling_code
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

  /**
   * Fetch outstanding bills for the bulk-receipt template.
   *
   * Always restricts to receiptable statuses (unpaid + partially_paid) — bills
   * already paid / cancelled / refunded are silently dropped because there's
   * nothing to receipt against them.
   *
   * The filter shape intentionally mirrors the schedule-page query params so
   * the dialog can pass through the user's current view 1:1.
   *
   * @param supabaseClient — REQUIRED for server-side calls. The default
   *   browser client doesn't apply when the API route runs.
   */
  static async getOutstandingBillsForBulk(
    filters: {
      institution_id?: string;
      /**
       * Tenant boundary for callers that reach this method through the
       * service-role client (the bulk-template API routes), where RLS is not
       * in the path. Restricts the result to these institutions regardless of
       * `institution_id`. Omit ONLY for super admins.
       */
      institution_ids?: string[];
      item_category_id?: string;
      degree_id?: string;
      department_id?: string;
      program_id?: string;
      semester_id?: string;
      section_id?: string;
      academic_year_id?: string;
      due_date_from?: string;
      due_date_to?: string;
    },
    supabaseClient?: SupabaseClient
  ): Promise<
    Array<{
      bill_id: string;
      student_id: string;
      institution_id: string;
      roll_number: string;
      student_name: string;
      bill_description: string | null;
      category: string | null;
      balance_amount: number;
    }>
  > {
    const client = this.getClient(supabaseClient);

    // Note: balance_amount can be NULL for legacy rows. The .gt('balance_amount', 0)
    // filter would silently exclude those — we want them too because their
    // final_amount is still owed. Using .or(...) keeps both paths.
    let query = client
      .from('billing_student_bills')
      .select(
        `
        id,
        student_id,
        institution_id,
        item_category_id,
        bill_description,
        balance_amount,
        final_amount,
        due_date,
        status,
        student:learners_profiles!inner (
          id,
          first_name,
          last_name,
          roll_number,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          academic_year_id
        ),
        item_category:billing_categories (
          id,
          category_name
        )
        `
      )
      .in('status', ['unpaid', 'partially_paid']);

    // Applied BEFORE the caller's own institution filter and independently of
    // it: institution_id narrows what the user asked for, institution_ids
    // bounds what they are allowed to see. Both may be present.
    if (filters.institution_ids && filters.institution_ids.length > 0) {
      query = query.in('institution_id', filters.institution_ids);
    }
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.item_category_id) {
      query = query.eq('item_category_id', filters.item_category_id);
    }
    if (filters.due_date_from) {
      query = query.gte('due_date', filters.due_date_from);
    }
    if (filters.due_date_to) {
      query = query.lte('due_date', filters.due_date_to);
    }
    // Academic hierarchy filters apply on the joined learner row
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
    // Academic year lives ON the bill, not on the learner — bills are created
    // per academic year, and a learner's current year runs ahead of the years
    // their older unpaid bills belong to. Measured 2026-07-31: 1,774 of 6,598
    // outstanding bills (26.9%) carry a bill-year that differs from their
    // learner's current year, so binding this to student.academic_year_id
    // silently returned the wrong set. Matches student-bill-service.ts, where
    // the same-named schedule-page filter already targets the bill's column.
    // 'unspecified' is the schedule page's magic value for "no year set".
    if (filters.academic_year_id === 'unspecified') {
      query = query.is('academic_year_id', null);
    } else if (filters.academic_year_id) {
      query = query.eq('academic_year_id', filters.academic_year_id);
    }

    // Cap result size — a single Excel sheet over 5000 rows becomes unwieldy
    // for a human to fill, and Excel itself slows down with validation rules
    // applied row-by-row. The dialog warns when the cap is hit.
    const { data, error } = await query
      .order('due_date', { ascending: true })
      .limit(5000);

    if (error) {
      logger.error('billing/receipts', 'getOutstandingBillsForBulk failed', error);
      throw error;
    }

    return (data ?? []).map((bill: any) => {
      const balance =
        bill.balance_amount && Number(bill.balance_amount) > 0
          ? Number(bill.balance_amount)
          : Number(bill.final_amount);
      const firstName = bill.student?.first_name ?? '';
      const lastName = bill.student?.last_name ?? '';
      return {
        bill_id: bill.id as string,
        student_id: bill.student_id as string,
        institution_id: bill.institution_id as string,
        roll_number: (bill.student?.roll_number ?? '') as string,
        student_name: `${firstName} ${lastName}`.trim(),
        bill_description: (bill.bill_description ?? null) as string | null,
        category: (bill.item_category?.category_name ?? null) as string | null,
        balance_amount: balance
      };
    });
  }

  /**
   * Count outstanding bills matching the bulk-receipt template filters.
   *
   * Uses Supabase's `count: 'exact', head: true` mode so it returns the
   * count without serializing any rows. Mirrors the filter logic in
   * getOutstandingBillsForBulk exactly — kept in lock-step so the preview
   * count in the dialog never drifts from what the actual download would
   * produce.
   *
   * Note: this does NOT apply the 5000-row cap that the download method
   * uses. The dialog uses the true count to decide whether to show a
   * "first 5000 only" warning before the user hits Download.
   */
  static async countOutstandingBillsForBulk(
    filters: {
      institution_id?: string;
      /** See getOutstandingBillsForBulk — same tenant boundary, kept in lock-step. */
      institution_ids?: string[];
      item_category_id?: string;
      degree_id?: string;
      department_id?: string;
      program_id?: string;
      semester_id?: string;
      section_id?: string;
      academic_year_id?: string;
      due_date_from?: string;
      due_date_to?: string;
    },
    supabaseClient?: SupabaseClient
  ): Promise<number> {
    const client = this.getClient(supabaseClient);

    // Only join learners_profiles when a hierarchy filter ACTUALLY needs it.
    // Without this conditional, the count query forces a full inner-join
    // even for "give me the system-wide total" requests, which can blow
    // past the 15s client deadline on a large bills table for no reason —
    // every bill has a learner, so the join doesn't filter anything.
    // academic_year_id is deliberately NOT in this list — it filters the
    // bill's own column (see getOutstandingBillsForBulk), so it needs no
    // learner join.
    const needsLearnerJoin = !!(
      filters.degree_id ||
      filters.department_id ||
      filters.program_id ||
      filters.semester_id ||
      filters.section_id
    );

    let query = needsLearnerJoin
      ? client
          .from('billing_student_bills')
          .select(
            `id, student:learners_profiles!inner (id)`,
            { count: 'exact', head: true }
          )
      : client
          .from('billing_student_bills')
          .select('id', { count: 'exact', head: true });

    query = query.in('status', ['unpaid', 'partially_paid']);

    // Mirrors getOutstandingBillsForBulk — the live preview count must reflect
    // the same tenant boundary as the file the user will actually download,
    // otherwise a scoped user sees "1,200 bills match" and receives 40.
    if (filters.institution_ids && filters.institution_ids.length > 0) {
      query = query.in('institution_id', filters.institution_ids);
    }
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.item_category_id) {
      query = query.eq('item_category_id', filters.item_category_id);
    }
    if (filters.due_date_from) {
      query = query.gte('due_date', filters.due_date_from);
    }
    if (filters.due_date_to) {
      query = query.lte('due_date', filters.due_date_to);
    }
    // Bill-level column — applies with or without the learner join.
    if (filters.academic_year_id === 'unspecified') {
      query = query.is('academic_year_id', null);
    } else if (filters.academic_year_id) {
      query = query.eq('academic_year_id', filters.academic_year_id);
    }
    // Hierarchy filters only apply when the join is part of the SELECT.
    // The `needsLearnerJoin` flag above guarantees that branch.
    if (needsLearnerJoin) {
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

    const { count, error } = await query;

    if (error) {
      logger.error(
        'billing/receipts',
        'countOutstandingBillsForBulk failed',
        error
      );
      throw error;
    }

    return count ?? 0;
  }
}
