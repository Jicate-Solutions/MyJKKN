// lib/services/ims/payment-service.ts

import { createServerSupabaseClient } from '@/lib/supabase/server';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

export interface GenerateUpiQrParams {
  storeId: string;
  amount: number;
  customerName?: string | null;
  createdBy: string;
}

export interface GenerateUpiQrResult {
  qrBase64: string;
  transactionRef: string;
  expiresAt: string;
}

export interface ConfirmUpiQrParams {
  transactionRef: string;
  upiTransactionId: string;
  confirmedBy: string;
}

export interface ConfirmUpiQrResult {
  success: true;
  transactionRef: string;
  upiTransactionId: string;
}

export class ImsPaymentService {
  /**
   * Look up store UPI config, verify store ownership against user's institution,
   * generate UPI QR string, and insert a tracking record into ims_upi_qr_payments.
   *
   * Ownership check: the store's institution_id must match the profile's
   * institution_id. Super-admins (institution_id IS NULL on profile) bypass
   * this check.
   */
  static async generateUpiQr(params: GenerateUpiQrParams): Promise<GenerateUpiQrResult> {
    const supabase = await createServerSupabaseClient();
    const { storeId, amount, customerName, createdBy } = params;

    // Fetch store UPI config AND institution_id for ownership check
    const { data: store, error: storeError } = await supabase
      .from('ims_stores')
      .select('id, name, upi_vpa, upi_merchant_name, institution_id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      throw new Error('Store not found');
    }

    if (!store.upi_vpa) {
      throw new Error('UPI VPA not configured for this store. Update store settings.');
    }

    // Ownership check: verify the store belongs to the caller's institution
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', createdBy)
      .single();

    if (profileError || !profileData) {
      throw new Error('User profile not found');
    }

    // Only enforce institution check when profile has an institution_id
    // (super-admins without an institution_id can access any store)
    if (
      profileData.institution_id !== null &&
      store.institution_id !== profileData.institution_id
    ) {
      throw new Error('Store does not belong to your institution');
    }

    // Generate unique transaction reference
    const timestamp = Date.now().toString(36).toUpperCase();
    const suffix = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
    const transactionRef = `JKKN${timestamp}${suffix}`;

    // Build UPI deeplink
    const merchantName = store.upi_merchant_name || store.name || 'JKKN Store';
    const upiString = `upi://pay?pa=${encodeURIComponent(store.upi_vpa)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=INR&tr=${transactionRef}`;

    // Generate QR code as base64 data URL
    const qrBase64 = await QRCode.toDataURL(upiString, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    // 15-minute expiry
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Insert tracking record
    const { error: insertError } = await supabase
      .from('ims_upi_qr_payments')
      .insert({
        store_id: storeId,
        transaction_ref: transactionRef,
        upi_string: upiString,
        amount,
        customer_name: customerName ?? null,
        customer_phone: null,
        status: 'pending',
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('[ImsPaymentService] Insert error:', insertError);
      throw new Error('Failed to create payment record');
    }

    return { qrBase64, transactionRef, expiresAt };
  }

  /**
   * Confirm a UPI QR payment: validates state and expiry, then marks the
   * ims_upi_qr_payments record as paid.
   */
  static async confirmUpiQr(params: ConfirmUpiQrParams): Promise<ConfirmUpiQrResult> {
    const supabase = await createServerSupabaseClient();
    const { transactionRef, upiTransactionId, confirmedBy } = params;

    // Find the payment record
    const { data: payment, error: findError } = await supabase
      .from('ims_upi_qr_payments')
      .select('id, status, expires_at, store_id')
      .eq('transaction_ref', transactionRef)
      .single();

    if (findError || !payment) {
      throw new Error('Payment record not found');
    }

    // Validate current state
    if (payment.status === 'paid') {
      throw new Error('Payment already confirmed');
    }

    if (payment.status === 'expired' || payment.status === 'failed') {
      throw new Error(`Payment is ${payment.status}`);
    }

    // Check expiry
    const expiresAt = new Date(payment.expires_at);
    if (expiresAt < new Date()) {
      // Mark as expired before rejecting
      await supabase
        .from('ims_upi_qr_payments')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', payment.id);

      throw new Error('Payment has expired. Please generate a new QR.');
    }

    // Verify confirmedBy belongs to the same institution as the store
    const { data: storeOwner } = await supabase
      .from('ims_stores')
      .select('institution_id')
      .eq('id', payment.store_id)
      .single();

    const { data: confirmerProfile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', confirmedBy)
      .single();

    if (
      storeOwner &&
      confirmerProfile &&
      confirmerProfile.institution_id !== null &&
      storeOwner.institution_id !== confirmerProfile.institution_id
    ) {
      throw new Error('Unauthorized: store does not belong to your institution');
    }

    // Confirm payment
    const { error: updateError } = await supabase
      .from('ims_upi_qr_payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        confirmed_by: confirmedBy,
        upi_transaction_id: upiTransactionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (updateError) {
      console.error('[ImsPaymentService] Update error:', updateError);
      throw new Error('Failed to confirm payment');
    }

    return { success: true, transactionRef, upiTransactionId };
  }
}
