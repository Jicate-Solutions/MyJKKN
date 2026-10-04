// app/api/courses/payments/verify/route.ts
//
// POST — verify a completed Razorpay payment and credit every instalment it
// covers.
//
// The browser tells us a payment happened. That claim is worth nothing on its
// own, so nothing here trusts it: the signature is recomputed server-side with
// the key secret, and the amount is re-read from Razorpay rather than taken
// from the request. A participant who forges a callback gets a 400, not a
// credited bill.
//
// ONE ORDER, ONE OR MORE ROWS. initiate/route.ts can start a single Razorpay
// order that covers several selected instalments — one course_bill_payments
// row per bill, all sharing razorpay_order_id. Every row for that order is
// fetched here and settled together: Razorpay reports one captured total for
// the whole order, never a per-bill breakdown, so the split decided at
// initiate time (each row's own amount_paid) is the only trustworthy
// allocation. It is never recomputed from the captured amount — only
// cross-checked against it.
//
// SIGNATURE IS CHECKED WITH THE PINNED ACCOUNT. Every row for the order
// carries the same razorpay_account_id from initiate, and credentials are
// resolved by that id rather than by institution — so a credential rotation
// between order and payment cannot make a genuine payment fail verification.
//
// IDEMPOTENT BY CONSTRUCTION. course_bill_payments_rzp_payment_bill_uniq is a
// partial unique index on (razorpay_payment_id, bill_id), so a replayed
// callback hits 23505 per row rather than crediting twice — and still allows
// several bills to legitimately share one payment id. Balances are recomputed
// by trg_course_bill_payments_recompute, which fires on the UPDATE below — the
// bill's paid_amount and the enrollment's balance are never written by hand.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { settleCourseOrder } from '@/lib/services/payments/course-settlement';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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

    const { data: payments } = await admin
      .from('course_bill_payments')
      .select('id, bill_id, enrollment_id, institution_id, status, amount_paid, razorpay_account_id, transaction_ref')
      .eq('razorpay_order_id', orderId);

    if (!payments || payments.length === 0) {
      return NextResponse.json({ ok: false, error: 'Unknown payment' }, { status: 404 });
    }
    const rows = payments as any[];

    // Every row for one order shares one enrolment (initiate/route.ts enforces
    // this), so the ownership check only needs to run once.
    const { data: enrollment } = await admin
      .from('course_enrollments')
      .select('profile_id')
      .eq('id', rows[0].enrollment_id)
      .maybeSingle();

    // The order must belong to the caller. Without this, anyone signed in could
    // post somebody else's order id and settle their bill — harmless to the
    // payer's wallet but a way to see and alter another person's billing state.
    if ((enrollment as any)?.profile_id !== auth.user.id) {
      return NextResponse.json({ ok: false, error: 'Unknown payment' }, { status: 404 });
    }

    // Already settled by an earlier call. Report success: the participant's
    // money did arrive, and a second click must not read as a failure.
    if (rows.every((r) => r.status === 'success')) {
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }

    const pinnedAccountId = rows[0].razorpay_account_id;

    // Resolved by PINNED account id, not by institution — rotation-safe.
    const provider = await getPaymentProvider('courses', {
      accountId: pinnedAccountId,
      institutionId: rows[0].institution_id,
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
        .eq('razorpay_order_id', orderId);

      console.error('[courses/pay/verify] signature mismatch', { orderId, paymentId });
      return NextResponse.json(
        { ok: false, error: 'This payment could not be verified.' },
        { status: 400 },
      );
    }

    // Re-read the AUTHORITATIVE amount and state from Razorpay. A valid
    // signature proves the payment belongs to this order; it does not prove how
    // much was captured, and a partial capture credited at face value would
    // clear instalments that were not fully paid for.
    const intendedTotal = round2(rows.reduce((sum, r) => sum + Number(r.amount_paid ?? 0), 0));
    let capturedPaise = 0;
    let feePaise = 0;
    let gatewayStatus: string | undefined;
    let raw: unknown = null;

    try {
      const status = await provider.getPaymentStatus(paymentId);
      raw = (status as any)?.raw ?? null;
      gatewayStatus = (status as any)?.status;
      capturedPaise = Number((status as any)?.amountPaise ?? 0);
      feePaise = Number((raw as any)?.fee ?? 0);
    } catch (e: any) {
      // Do NOT credit on an unreadable gateway state. Left 'initiated' so a
      // later retry or manual reconciliation can settle it, rather than guessing.
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
        .eq('razorpay_order_id', orderId);
      return NextResponse.json(
        { ok: false, error: `Payment not completed (${gatewayStatus}).` },
        { status: 400 },
      );
    }

    // The gateway reports one total for the whole order, never a per-bill
    // split. When it matches what was requested at initiate time — exactly, or
    // plus the customer-borne gateway fee on net banking / cards — each row's
    // own amount_paid (already validated against its bill's balance) is
    // credited as-is. Any other mismatch is not something to guess a new split
    // for: everything stays 'initiated' for a human to reconcile, the same
    // defensive stance as an unreadable gateway state above.
    const result = await settleCourseOrder(admin, {
      orderId,
      paymentId,
      signature,
      capturedPaise,
      feePaise,
      gatewayResponse: raw,
    });

    if (result.outcome === 'amount_mismatch' || result.outcome === 'not_found') {
      console.error('[courses/pay/verify] captured amount does not match requested total', {
        orderId,
        ...result,
        intendedTotal,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your payment is being confirmed. It will appear here shortly — do not pay again.',
        },
        { status: 202 },
      );
    }

    if (result.outcome === 'error') {
      console.error('[courses/pay/verify] update failed:', result.message, { orderId });
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your payment went through but could not be fully recorded. Please contact the institution — do not pay again.',
        },
        { status: 500 },
      );
    }

    if (result.updated === 0) {
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }

    return NextResponse.json({ ok: true, amount: intendedTotal, paymentId });
  },
  { allowApiKey: false },
);
