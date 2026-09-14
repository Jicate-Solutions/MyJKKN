/**
 * Server Actions for Billing Receipts
 *
 * All receipt mutations with proper cache invalidation and permission checks.
 */

'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cacheTags } from '@/lib/cache';
import { RECEIPT_EMAIL_NOT_AVAILABLE } from '@/lib/services/billing/email-not-available';
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

// deleteReceipt was removed 2026-08-25 along with the detail page's Delete
// button, its only caller. It reported success on a blocked delete: RLS filters
// the row out, Postgres deletes zero rows, and zero rows is not an error — so
// `deleteError` was null and the caller toasted "deleted successfully" over a
// receipt that still existed. An exported server action is a live endpoint, so
// leaving it unused would have kept that hard-delete path callable.
//
// Reversing a receipt now goes through the cancellation workflow (request →
// super-admin approval → bill reverted), or, for a super admin in a hurry, the
// Void action on /billing/receipts — which keeps the receipt number accounted
// for and requires a reason, unlike a hard delete.

/**
 * Send receipt via email — NOT BUILT.
 *
 * This returned `success: true` over a TODO, so the receipt page showed a
 * success message while nothing was sent. It now always fails with
 * a message pointing staff to Download. No button calls it any more; it stays
 * because an exported server action is a live endpoint, and an old caller must
 * get an honest answer. Real emailing needs an email service decision first.
 */
export async function sendReceipt(
  _id: string,
  _email: string
): Promise<ActionResult> {
  return { success: false, error: RECEIPT_EMAIL_NOT_AVAILABLE };
}
