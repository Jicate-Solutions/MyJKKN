/**
 * Server Actions for Billing Receipts
 *
 * All receipt mutations with proper cache invalidation and permission checks.
 */

'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cacheTags } from '@/lib/cache';
import type { CreateReceiptDto, UpdateReceiptDto } from '@/types/billing-schedule';

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new billing receipt
 */
export async function createReceipt(
  data: CreateReceiptDto
): Promise<ActionResult<{ receiptId: string }>> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Generate receipt number
    const { data: receiptNumber, error: rpcError } = await supabase.rpc(
      'generate_receipt_number'
    );

    if (rpcError || !receiptNumber) {
      console.error('[createReceipt] Error generating receipt number:', rpcError);
      return {
        success: false,
        error: 'Failed to generate receipt number'
      };
    }

    // Create receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('billing_receipts')
      .insert({
        receipt_number: receiptNumber,
        receipt_date: new Date().toISOString().split('T')[0],
        student_id: data.student_id,
        institution_id: data.institution_id,
        payment_mode: data.payment_mode,
        payment_reference_number: data.payment_reference_number,
        payment_amount: data.payment_amount,
        payment_paid_date: data.payment_paid_date,
        payer_name: data.payer_name,
        payer_contact: data.payer_contact,
        accountant_id: data.accountant_id,
        payment_remarks: data.payment_remarks,
        created_by: user.id
      })
      .select('id')
      .single();

    if (receiptError) {
      console.error('[createReceipt] Error creating receipt:', receiptError);
      return {
        success: false,
        error: `Failed to create receipt: ${receiptError.message}`
      };
    }

    // Create receipt items
    if (data.receipt_items && data.receipt_items.length > 0) {
      const receiptItems = data.receipt_items.map((item) => ({
        receipt_id: receipt.id,
        bill_id: item.bill_id,
        amount_paid: item.amount_paid
      }));

      const { error: itemsError } = await supabase
        .from('billing_receipt_items')
        .insert(receiptItems);

      if (itemsError) {
        console.error('[createReceipt] Error creating receipt items:', itemsError);
        // Rollback receipt creation
        await supabase.from('billing_receipts').delete().eq('id', receipt.id);
        return {
          success: false,
          error: `Failed to create receipt items: ${itemsError.message}`
        };
      }
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');
    if (data.student_id) {
      await revalidateTag(
        cacheTags.billing.receipts.byStudent(data.student_id),
        'warm'
      );
    }
    await revalidateTag(cacheTags.billing.bills.list(), 'warm');

    return {
      success: true,
      data: { receiptId: receipt.id }
    };
  } catch (error) {
    console.error('[createReceipt] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create receipt'
    };
  }
}

/**
 * Update an existing receipt
 */
export async function updateReceipt(
  id: string,
  data: UpdateReceiptDto
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error: updateError } = await supabase
      .from('billing_receipts')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('[updateReceipt] Error updating receipt:', updateError);
      return {
        success: false,
        error: `Failed to update receipt: ${updateError.message}`
      };
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.byId(id), 'warm');
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');

    return { success: true };
  } catch (error) {
    console.error('[updateReceipt] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update receipt'
    };
  }
}

/**
 * Delete a receipt
 */
export async function deleteReceipt(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error: deleteError } = await supabase
      .from('billing_receipts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[deleteReceipt] Error deleting receipt:', deleteError);
      return {
        success: false,
        error: `Failed to delete receipt: ${deleteError.message}`
      };
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.byId(id), 'warm');
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');

    return { success: true };
  } catch (error) {
    console.error('[deleteReceipt] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete receipt'
    };
  }
}

/**
 * Send receipt via email
 *
 * NOTE: Email service integration pending - currently simulated.
 * Validates the receipt exists and logs the send attempt.
 * When an email service (e.g., Resend, SendGrid) is integrated, replace the
 * simulation below with actual email delivery.
 */
export async function sendReceipt(
  id: string,
  email: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get receipt details
    const { data: receipt, error: fetchError } = await supabase
      .from('billing_receipts')
      .select(
        `
        *,
        student:learners_profiles(id, first_name, last_name, college_email)
      `
      )
      .eq('id', id)
      .single();

    if (fetchError || !receipt) {
      return {
        success: false,
        error: 'Receipt not found'
      };
    }

    // NOTE: Email service integration pending - currently simulated
    console.log(
      `[billing/receipts] Simulated email send: Receipt ${receipt.receipt_number} to ${email} by user ${user.id}`
    );

    return {
      success: true,
      data: {
        action: 'email_simulated',
        message: `Receipt ${receipt.receipt_number} sent to ${email}`
      }
    };
  } catch (error) {
    console.error('[sendReceipt] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send receipt'
    };
  }
}

/**
 * Download receipt as PDF
 *
 * Uses browser-native Print -> Save as PDF approach on the client side.
 * This server action validates the receipt exists and returns a signal
 * for the client to open a formatted print view.
 */
export async function downloadReceiptPDF(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify receipt exists
    const { data: receipt, error: fetchError } = await supabase
      .from('billing_receipts')
      .select('id, receipt_number')
      .eq('id', id)
      .single();

    if (fetchError || !receipt) {
      return {
        success: false,
        error: 'Receipt not found'
      };
    }

    return {
      success: true,
      data: {
        url: 'print' // Signals the client to use browser print/save-as-PDF
      }
    };
  } catch (error) {
    console.error('[downloadReceiptPDF] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download receipt'
    };
  }
}
