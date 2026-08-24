// app/api/courses/payments/verify/route.ts
//
// POST — verify a completed Razorpay payment and credit the instalment.
//
// The browser tells us a payment happened. That claim is worth nothing on its
// own, so nothing here trusts it: the signature is recomputed server-side with
// the key secret, and the amount is re-read from Razorpay rather than taken
// from the request. A participant who forges a callback gets a 400, not a
// credited bill.
//
// SIGNATURE IS CHECKED WITH THE PINNED ACCOUNT. The payment row carries
// razorpay_account_id from initiate, and credentials are resolved by that id
// rather than by institution — so a credential rotation between order and
// payment cannot make a genuine payment fail verification.
//
// IDEMPOTENT BY CONSTRUCTION. course_bill_payments_rzp_payment_uniq is a
// partial unique index on razorpay_payment_id, so a replayed callback hits
// 23505 rather than crediting twice. Balances are recomputed by
// trg_course_bill_payments_recompute, which fires on the UPDATE below — the
// bill's paid_amount and the enrollment's balance are never written by hand.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { fromPaise } from '@/lib/services/payments/amount';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => ({}));
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = (body ?? {}) as Record<string, string>;

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        { ok: false, error: 'Incomplete payment details' },
        { status: 400 },
      );
    }

    const admin = serviceClient();

    const { data: payment } = await admin
      .from('course_bill_payments')
      .select('id, bill_id, enrollment_id, institution_id, status, amount_paid, razorpay_account_id, transaction_ref')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ ok: false, error: 'Unknown payment' }, { status: 404 });
    }
    const pay = payment as any;

    // The order must belong to the caller. Without this, anyone signed in could
    // post somebody else's order id and settle their bill — harmless to the
    // payer's wallet but a way to see and alter another person's billing state.
    const { data: enrollment } = await admin
      .from('course_enrollments')
      .select('profile_id')
      .eq('id', pay.enrollment_id)
      .maybeSingle();

    if ((enrollment as any)?.profile_id !== auth.user.id) {
      return NextResponse.json({ ok: false, error: 'Unknown payment' }, { status: 404 });
    }

    // Already settled by an earlier call or by the webhook. Report success:
    // the participant's money did arrive, and a second click must not read as
    // a failure.
    if (pay.status === 'success') {
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }

    // Resolved by PINNED account id, not by institution — rotation-safe.
    const provider = await getPaymentProvider('courses', {
      accountId: pay.razorpay_account_id,
      institutionId: pay.institution_id,
    });

    const valid = provider.verifySignature({
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      signature,
    });

    if (!valid) {
      await admin
        .from('course_bill_payments')
        .update({ status: 'failed', gateway_response: { reason: 'signature_mismatch' } } as any)
        .eq('id', pay.id);

      console.error('[courses/pay/verify] signature mismatch', { orderId, paymentId });
      return NextResponse.json(
        { ok: false, error: 'This payment could not be verified.' },
        { status: 400 },
      );
    }

    // Re-read the AUTHORITATIVE amount and state from Razorpay. A valid
    // signature proves the payment belongs to this order; it does not prove how
    // much was captured, and a partial capture credited at face value would
    // clear a bill that was not fully paid.
    let capturedRupees = Number(pay.amount_paid ?? 0);
    let gatewayStatus: string | undefined;
    let raw: unknown = null;

    try {
      const status = await provider.getPaymentStatus(paymentId);
      raw = (status as any)?.raw ?? null;
      gatewayStatus = (status as any)?.status;
      const paise = (status as any)?.amountPaise;
      if (typeof paise === 'number' && paise > 0) capturedRupees = fromPaise(paise as any);
    } catch (e: any) {
      // Do NOT credit on an unreadable gateway state. Left 'initiated' so the
      // webhook or the late-auth cron can settle it, rather than guessing.
      console.error('[courses/pay/verify] status fetch failed:', e?.message ?? e);
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your payment is being confirmed. It will appear here shortly — do not pay again.',
        },
        { status: 202 },
      );
    }

    if (gatewayStatus && !['captured', 'authorized', 'success'].includes(gatewayStatus)) {
      await admin
        .from('course_bill_payments')
        .update({ status: 'failed', gateway_response: raw as any } as any)
        .eq('id', pay.id);
      return NextResponse.json(
        { ok: false, error: `Payment not completed (${gatewayStatus}).` },
        { status: 400 },
      );
    }

    // The UPDATE fires trg_course_bill_payments_recompute, which rewrites the
    // bill's paid_amount/balance/status and the enrollment's totals. Nothing
    // here touches those columns directly.
    // Derived from transaction_ref, which is already UNIQUE, so the receipt
    // number inherits that uniqueness without a counter or a sequence to race
    // on. course_bill_payments_receipt_number_key would otherwise be an
    // occasional 23505 under concurrent payments.
    const receiptNumber = `CR-${String(pay.transaction_ref ?? '').replace(/^CP-/, '')}`;

    const { error: updateError } = await admin
      .from('course_bill_payments')
      .update({
        status: 'success',
        receipt_number: receiptNumber,
        amount_paid: capturedRupees,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        captured_at: new Date().toISOString(),
        gateway_response: raw as any,
      } as any)
      .eq('id', pay.id);

    if (updateError) {
      // 23505 on the partial unique index: this payment id is already recorded,
      // which means a webhook or an earlier call got there first. Success.
      if ((updateError as any).code === '23505') {
        return NextResponse.json({ ok: true, alreadyRecorded: true });
      }
      console.error('[courses/pay/verify] update failed:', updateError.message);
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your payment went through but could not be recorded. Please contact the institution — do not pay again.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, amount: capturedRupees, paymentId });
  },
  { allowApiKey: false },
);
