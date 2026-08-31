// app/api/courses/payments/initiate/route.ts
//
// POST — start an online payment for ONE course instalment bill.
//
// Called by the participant from /my-courses. Returns what Razorpay Checkout
// needs on the client: the order id, the PUBLIC key id, and the amount.
//
// THE AMOUNT IS NEVER TAKEN FROM THE CLIENT. It is read from course_bills
// server-side. A body-supplied amount is the classic way a checkout gets
// under-paid: the browser is not a trustworthy source for what somebody owes.
//
// WHICH INSTITUTION GETS THE MONEY: the bill's own institution_id, resolved
// through the shared vault (resolveRazorpayCredentials → the institution's
// active razorpay_accounts row, falling back to the common env account). So a
// course run by one college is paid into that college's merchant account
// without any per-course configuration.
//
// The chosen account is PINNED onto the payment row as razorpay_account_id, so
// verification later uses the same account that created the order even if the
// institution rotates credentials in between.

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';
import { COURSE_FEE_HEAD } from '@/lib/services/payments/fee-heads';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Short, unique, and human-quotable in a support call. */
const transactionRef = () =>
  `CP-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => ({}));
    const { billId } = (body ?? {}) as { billId?: string };

    if (!billId) {
      return NextResponse.json({ ok: false, error: 'Missing bill id' }, { status: 400 });
    }

    // Read through the USER's client. RLS on course_bills already allows a
    // participant to see only their own (course_bills_select carries an EXISTS
    // on course_enrollments.profile_id = auth.uid()), so this single read is
    // both the fetch and the authorisation check — there is no way to name
    // somebody else's bill and have it come back.
    const { data: bill, error: readError } = await auth.supabase
      .from('course_bills')
      .select(
        `id, bill_number, installment_no, label, total_amount, paid_amount, balance_amount,
         status, institution_id, enrollment_id,
         enrollment:course_enrollments!course_bills_enrollment_id_fkey(
           id, profile_id, enrollment_number,
           course:course_events!course_enrollments_course_event_id_fkey(title)
         )`,
      )
      .eq('id', billId)
      .maybeSingle();

    if (readError) {
      console.error('[courses/pay/initiate] bill read failed:', readError.message);
      return NextResponse.json({ ok: false, error: 'Could not load the bill' }, { status: 500 });
    }
    if (!bill) {
      return NextResponse.json({ ok: false, error: 'Bill not found' }, { status: 404 });
    }

    const b = bill as any;

    // Only the person the bill belongs to may pay it here. RLS also lets billing
    // STAFF read the row, and this endpoint is the participant's self-service
    // path — an admin recording a payment goes through the offline flow.
    if (b.enrollment?.profile_id !== auth.user.id) {
      return NextResponse.json(
        { ok: false, error: 'You can only pay your own instalments.' },
        { status: 403 },
      );
    }

    if (b.status === 'paid') {
      return NextResponse.json(
        { ok: false, error: 'This instalment is already paid.' },
        { status: 409 },
      );
    }
    if (b.status === 'voided') {
      return NextResponse.json(
        { ok: false, error: 'This instalment has been cancelled.' },
        { status: 409 },
      );
    }

    // The outstanding balance, from the database. Partial payments are already
    // reflected here by fn_course_recompute_balances.
    const due = Number(b.balance_amount ?? 0);
    if (!(due > 0)) {
      return NextResponse.json(
        { ok: false, error: 'There is nothing left to pay on this instalment.' },
        { status: 409 },
      );
    }

    const admin = serviceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email, phone_number')
      .eq('id', auth.user.id)
      .maybeSingle();
    const p = (profile ?? {}) as any;

    const ref = transactionRef();
    const amountPaise = toPaise(due);

    try {
      // purpose: 'create-order' makes the resolver refuse a test-mode key in
      // production. Razorpay's sandbox auto-"pays" a UPI QR in ~15s with no
      // money moving, so a real bill routed at a test account would be marked
      // paid and receipted against nothing.
      // ── which merchant account gets the money ───────────────────────────
      // The invariant is that it must be the HOSTING INSTITUTION's account,
      // never the shared env one. WHICH head within that institution is a
      // routing preference, so it is tried as a ladder rather than demanded:
      //
      //   1. 'course'  — a dedicated course-fee account, or the institution's
      //                  default (fee_head IS NULL), since the resolver matches
      //                  `fee_head = asked OR fee_head IS NULL`.
      //   2. 'tuition' — the institution's fee-income account. Course fees are
      //                  fee income; this is where a college that has not set
      //                  up a separate course account already banks them.
      //
      // 'ims_pos' is deliberately NOT in the ladder: those are counter/store
      // takings, reconciled separately, and sweeping course fees into them
      // would corrupt both sets of books.
      //
      // Demanding 'course' alone was the first cut and it was wrong — it turned
      // a preference into a requirement and 503'd a college that was correctly
      // configured with a live tuition account.
      const ACCOUNT_LADDER = [COURSE_FEE_HEAD, 'tuition'];

      let provider: Awaited<ReturnType<typeof getPaymentProvider>> | null = null;
      let accountId: string | null = null;

      // Each rung is tried INDEPENDENTLY, because a rung can THROW rather than
      // return. resolveRazorpayCredentials fails closed at order creation when
      // resolution lands on a test-mode key in production
      // (assertUsableForNewOrder) — and asking for a head the institution does
      // not have is exactly what makes it land on the common env key.
      //
      // That is what broke production while dev passed: locally
      // sandboxPaymentsAllowed() is true, so rung 1 RETURNED the env test key,
      // the loop saw no accountId and moved on to 'tuition'. In production the
      // same rung THREW, the exception escaped the whole loop, and the live
      // tuition account that would have worked was never tried.
      let lastError: unknown = null;

      for (const head of ACCOUNT_LADDER) {
        try {
          const candidate = await getPaymentProvider('courses', {
            institutionId: b.institution_id,
            feeHead: head,
            purpose: 'create-order',
          });
          const candidateAccount = (candidate as { accountId?: string }).accountId ?? null;
          // accountId is set ONLY for an institution account; its absence means
          // the resolver fell through to the common env credentials, which this
          // route must not use.
          if (candidateAccount) {
            provider = candidate;
            accountId = candidateAccount;
            break;
          }
        } catch (e) {
          // Remembered, not rethrown: a later rung may still resolve a live
          // institution account, and only the last failure is worth reporting.
          lastError = e;
        }
      }

      // Still nothing institution-scoped: refuse rather than collect one
      // college's course fees into the shared merchant account. This is the
      // hazard lib/services/payments/fee-heads.ts documents.
      if (!provider || !accountId) {
        console.error('[courses/pay/initiate] no institution Razorpay account', {
          institutionId: b.institution_id,
          tried: ACCOUNT_LADDER,
          lastError: (lastError as any)?.message ?? null,
        });
        return NextResponse.json(
          {
            ok: false,
            error:
              'Online payment is not set up for this course yet. The institution needs to connect a Razorpay account.',
          },
          { status: 503 },
        );
      }

      const order = await provider.createOrder({
        transactionRef: ref,
        amountPaise,
        currency: 'INR',
        module: 'courses',
        notes: {
          bill_id: b.id,
          bill_number: b.bill_number,
          enrollment_id: b.enrollment_id,
          transaction_ref: ref,
          institution_id: b.institution_id ?? '',
        },
        description: `${b.enrollment?.course?.title ?? 'Course'} — ${b.label || `Instalment ${b.installment_no}`}`,
        customer: {
          name: p.full_name ?? undefined,
          // A synthetic participants.jkkn.local address must never be sent to
          // Razorpay: it is not deliverable, and the receipt would bounce.
          email:
            p.email && !String(p.email).endsWith('@participants.jkkn.local')
              ? p.email
              : undefined,
          phone: p.phone_number ?? undefined,
        },
      });

      // Recorded as 'initiated' BEFORE the participant pays, so an abandoned or
      // failed attempt is still visible to the institution rather than vanishing.
      // amount_paid must be > 0 (CHECK), so the intended amount is stored and
      // corrected on verify if Razorpay captured something different.
      const { error: insertError } = await admin.from('course_bill_payments').insert({
        bill_id: b.id,
        enrollment_id: b.enrollment_id,
        institution_id: b.institution_id,
        amount_paid: due,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_mode: 'razorpay',
        status: 'initiated',
        transaction_ref: ref,
        razorpay_order_id: order.gatewayOrderId,
        razorpay_account_id: accountId,
      } as any);

      if (insertError) {
        console.error('[courses/pay/initiate] txn insert failed:', insertError.message);
        return NextResponse.json(
          { ok: false, error: 'Could not start the payment. Please try again.' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        orderId: order.gatewayOrderId,
        // The PUBLIC key, carried on the order result (CreateOrderResult
        // .clientKeyId) — the same channel the events flow uses. keySecret
        // never leaves the server.
        keyId: order.clientKeyId,
        amountPaise,
        amount: due,
        currency: 'INR',
        transactionRef: ref,
        billNumber: b.bill_number,
        description: `${b.enrollment?.course?.title ?? 'Course'} — ${b.label || `Instalment ${b.installment_no}`}`,
        prefill: {
          name: p.full_name ?? '',
          email:
            p.email && !String(p.email).endsWith('@participants.jkkn.local') ? p.email : '',
          contact: p.phone_number ?? '',
        },
      });
    } catch (e: any) {
      // The resolver throws when the institution has no account AND no env
      // fallback — a real configuration state, so say so plainly rather than
      // returning a generic 500 the participant cannot act on.
      console.error('[courses/pay/initiate] order creation failed:', e?.message ?? e);
      return NextResponse.json(
        {
          ok: false,
          error:
            'Online payment is not available for this course yet. Please contact the institution.',
        },
        { status: 503 },
      );
    }
  },
  { allowApiKey: false },
);
