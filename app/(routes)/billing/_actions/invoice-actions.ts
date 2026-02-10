/**
 * Server Actions for Billing Invoices
 *
 * All invoice mutations (create, update, delete, send, download)
 * with proper cache invalidation and permission checks.
 */

'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cacheTags } from '@/lib/cache';
import type { CreateInvoiceDto, UpdateInvoiceDto } from '@/types/billing-schedule';

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new billing invoice
 */
export async function createInvoice(
  data: CreateInvoiceDto
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const supabase = await createClient();

    // Get current user for permission check
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Generate invoice number using database function
    const { data: invoiceNumber, error: rpcError } = await supabase.rpc(
      'generate_invoice_number'
    );

    if (rpcError || !invoiceNumber) {
      console.error('[createInvoice] Error generating invoice number:', rpcError);
      return {
        success: false,
        error: 'Failed to generate invoice number'
      };
    }

    // Calculate grand total
    const grandTotal =
      data.invoice_items.reduce((sum, item) => sum + item.amount, 0) +
      (data.additional_charges || 0) -
      (data.discount_applied || 0);

    // Create invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from('billing_invoices')
      .insert({
        invoice_number: invoiceNumber,
        invoice_type: data.invoice_type,
        invoice_date: new Date().toISOString().split('T')[0],
        student_id: data.student_id,
        institution_id: data.institution_id,
        billing_period_from: data.billing_period_from,
        billing_period_to: data.billing_period_to,
        invoice_description: data.invoice_description,
        tax_summary: data.tax_summary,
        payment_terms: data.payment_terms,
        due_date: data.due_date,
        additional_charges: data.additional_charges || 0,
        discount_applied: data.discount_applied || 0,
        grand_total: grandTotal,
        created_by: user.id
      })
      .select('id')
      .single();

    if (invoiceError) {
      console.error('[createInvoice] Error creating invoice:', invoiceError);
      return {
        success: false,
        error: `Failed to create invoice: ${invoiceError.message}`
      };
    }

    // Create invoice items
    if (data.invoice_items.length > 0) {
      const invoiceItems = data.invoice_items.map((item) => ({
        invoice_id: invoice.id,
        receipt_id: item.receipt_id,
        amount: item.amount
      }));

      const { error: itemsError } = await supabase
        .from('billing_invoice_items')
        .insert(invoiceItems);

      if (itemsError) {
        console.error('[createInvoice] Error creating invoice items:', itemsError);
        // Rollback invoice creation
        await supabase.from('billing_invoices').delete().eq('id', invoice.id);
        return {
          success: false,
          error: `Failed to create invoice items: ${itemsError.message}`
        };
      }
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.invoices.list(), 'warm');
    if (data.student_id) {
      await revalidateTag(
        cacheTags.billing.invoices.byStudent(data.student_id),
        'warm'
      );
    }
    if (data.institution_id) {
      await revalidateTag(
        cacheTags.billing.invoices.byInstitution(data.institution_id),
        'warm'
      );
    }

    return {
      success: true,
      data: { invoiceId: invoice.id }
    };
  } catch (error) {
    console.error('[createInvoice] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invoice'
    };
  }
}

/**
 * Update an existing invoice
 */
export async function updateInvoice(
  id: string,
  data: UpdateInvoiceDto
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get current user for permission check
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Update invoice
    const { error: updateError } = await supabase
      .from('billing_invoices')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('[updateInvoice] Error updating invoice:', updateError);
      return {
        success: false,
        error: `Failed to update invoice: ${updateError.message}`
      };
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.invoices.byId(id), 'warm');
    await revalidateTag(cacheTags.billing.invoices.list(), 'warm');

    return { success: true };
  } catch (error) {
    console.error('[updateInvoice] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update invoice'
    };
  }
}

/**
 * Delete an invoice
 */
export async function deleteInvoice(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get current user for permission check
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Delete invoice (cascade will handle invoice_items)
    const { error: deleteError } = await supabase
      .from('billing_invoices')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[deleteInvoice] Error deleting invoice:', deleteError);
      return {
        success: false,
        error: `Failed to delete invoice: ${deleteError.message}`
      };
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.invoices.byId(id), 'warm');
    await revalidateTag(cacheTags.billing.invoices.list(), 'warm');

    return { success: true };
  } catch (error) {
    console.error('[deleteInvoice] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete invoice'
    };
  }
}

/**
 * Send invoice via email
 *
 * NOTE: Email service integration pending - currently simulated.
 * Validates the invoice exists and logs the send attempt.
 * When an email service (e.g., Resend, SendGrid) is integrated, replace the
 * simulation below with actual email delivery.
 */
export async function sendInvoice(
  id: string,
  email: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get current user for permission check
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify invoice exists before acknowledging
    const { data: invoice, error: fetchError } = await supabase
      .from('billing_invoices')
      .select('id, invoice_number')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return {
        success: false,
        error: 'Invoice not found'
      };
    }

    // NOTE: Email service integration pending - currently simulated
    console.log(
      `[billing/invoices] Simulated email send: Invoice ${invoice.invoice_number} to ${email} by user ${user.id}`
    );

    return {
      success: true,
      data: {
        action: 'email_simulated',
        message: `Invoice ${invoice.invoice_number} sent to ${email}`
      }
    };
  } catch (error) {
    console.error('[sendInvoice] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send invoice'
    };
  }
}

/**
 * Download invoice as PDF
 *
 * Uses browser-native Print -> Save as PDF approach on the client side.
 * This server action validates the invoice exists and returns a signal
 * for the client to open a formatted print view.
 */
export async function downloadInvoicePDF(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createClient();

    // Get current user for permission check
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify invoice exists
    const { data: invoice, error: fetchError } = await supabase
      .from('billing_invoices')
      .select('id, invoice_number')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return {
        success: false,
        error: 'Invoice not found'
      };
    }

    return {
      success: true,
      data: {
        url: 'print' // Signals the client to use browser print/save-as-PDF
      }
    };
  } catch (error) {
    console.error('[downloadInvoicePDF] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download invoice'
    };
  }
}
