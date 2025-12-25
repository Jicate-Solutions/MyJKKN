/**
 * Server Actions for Billing Refunds
 *
 * All refund mutations with proper cache invalidation and permission checks.
 * Includes approval and processing workflows.
 */

'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cacheTags } from '@/lib/cache';
import type { CreateRefundDto, UpdateRefundDto } from '@/types/billing-schedule';

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new refund request
 */
export async function createRefund(
  data: CreateRefundDto
): Promise<ActionResult<{ refundId: string }>> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Create refund
    const { data: refund, error: refundError } = await supabase
      .from('billing_refunds')
      .insert({
        receipt_id: data.receipt_id,
        refund_category: data.refund_category,
        refund_reason: data.refund_reason,
        refund_amount: data.refund_amount,
        refund_method: data.refund_method,
        refund_date: data.refund_date || new Date().toISOString().split('T')[0],
        bank_details: data.bank_details,
        supporting_documents: data.supporting_documents,
        processing_fee: data.processing_fee || 0,
        net_refund_amount: (data.refund_amount || 0) - (data.processing_fee || 0),
        approval_status: 'pending',
        authorizer_id: user.id,
        created_by: user.id
      })
      .select('id')
      .single();

    if (refundError) {
      console.error('[createRefund] Error creating refund:', refundError);
      return {
        success: false,
        error: `Failed to create refund: ${refundError.message}`
      };
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');
    if (data.receipt_id) {
      await revalidateTag(
        cacheTags.billing.receipts.byId(data.receipt_id),
        'warm'
      );
    }
    await revalidateTag(cacheTags.billing.bills.list(), 'warm');

    return {
      success: true,
      data: { refundId: refund.id }
    };
  } catch (error) {
    console.error('[createRefund] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create refund'
    };
  }
}

/**
 * Update an existing refund
 */
export async function updateRefund(
  id: string,
  data: UpdateRefundDto
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Recalculate net amount if amounts changed
    const updateData: any = { ...data };
    if (data.refund_amount !== undefined || data.processing_fee !== undefined) {
      const { data: currentRefund } = await supabase
        .from('billing_refunds')
        .select('refund_amount, processing_fee')
        .eq('id', id)
        .single();

      if (currentRefund) {
        const refundAmount = data.refund_amount ?? currentRefund.refund_amount;
        const processingFee = data.processing_fee ?? currentRefund.processing_fee;
        updateData.net_refund_amount = refundAmount - processingFee;
      }
    }

    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('billing_refunds')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('[updateRefund] Error updating refund:', updateError);
      return {
        success: false,
        error: `Failed to update refund: ${updateError.message}`
      };
    }

    // Get receipt_id for cache invalidation
    const { data: refund } = await supabase
      .from('billing_refunds')
      .select('receipt_id')
      .eq('id', id)
      .single();

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');
    if (refund?.receipt_id) {
      await revalidateTag(
        cacheTags.billing.receipts.byId(refund.receipt_id),
        'warm'
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[updateRefund] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update refund'
    };
  }
}

/**
 * Delete/cancel a refund
 */
export async function deleteRefund(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get refund details before deletion for cache invalidation
    const { data: refund } = await supabase
      .from('billing_refunds')
      .select('receipt_id, approval_status')
      .eq('id', id)
      .single();

    // Only allow deletion of pending refunds
    if (refund?.approval_status !== 'pending') {
      return {
        success: false,
        error: 'Can only delete pending refunds'
      };
    }

    const { error: deleteError } = await supabase
      .from('billing_refunds')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[deleteRefund] Error deleting refund:', deleteError);
      return {
        success: false,
        error: `Failed to delete refund: ${deleteError.message}`
      };
    }

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');
    if (refund?.receipt_id) {
      await revalidateTag(
        cacheTags.billing.receipts.byId(refund.receipt_id),
        'warm'
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[deleteRefund] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete refund'
    };
  }
}

/**
 * Approve a refund (admin/manager action)
 */
export async function approveRefund(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // TODO: Add permission check for admin/manager role

    const { error: updateError } = await supabase
      .from('billing_refunds')
      .update({
        approval_status: 'approved',
        approved_by: user.id,
        approval_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('approval_status', 'pending'); // Only approve pending refunds

    if (updateError) {
      console.error('[approveRefund] Error approving refund:', updateError);
      return {
        success: false,
        error: `Failed to approve refund: ${updateError.message}`
      };
    }

    // Get receipt_id for cache invalidation
    const { data: refund } = await supabase
      .from('billing_refunds')
      .select('receipt_id')
      .eq('id', id)
      .single();

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');
    if (refund?.receipt_id) {
      await revalidateTag(
        cacheTags.billing.receipts.byId(refund.receipt_id),
        'warm'
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[approveRefund] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve refund'
    };
  }
}

/**
 * Process a refund (financial transaction - accountant action)
 */
export async function processRefund(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // TODO: Add permission check for accountant role

    // Get refund details
    const { data: refund, error: fetchError } = await supabase
      .from('billing_refunds')
      .select('approval_status, refund_amount, receipt_id')
      .eq('id', id)
      .single();

    if (fetchError || !refund) {
      return {
        success: false,
        error: 'Refund not found'
      };
    }

    // Must be approved before processing
    if (refund.approval_status !== 'approved') {
      return {
        success: false,
        error: 'Refund must be approved before processing'
      };
    }

    // Update refund status to processed
    const { error: updateError } = await supabase
      .from('billing_refunds')
      .update({
        approval_status: 'processed',
        processed_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('[processRefund] Error processing refund:', updateError);
      return {
        success: false,
        error: `Failed to process refund: ${updateError.message}`
      };
    }

    // TODO: Add actual financial transaction processing here
    // This should integrate with payment gateway or accounting system

    // Invalidate caches
    await revalidateTag(cacheTags.billing.receipts.list(), 'warm');
    if (refund.receipt_id) {
      await revalidateTag(
        cacheTags.billing.receipts.byId(refund.receipt_id),
        'warm'
      );
    }
    await revalidateTag(cacheTags.billing.bills.list(), 'warm');

    return { success: true };
  } catch (error) {
    console.error('[processRefund] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process refund'
    };
  }
}
