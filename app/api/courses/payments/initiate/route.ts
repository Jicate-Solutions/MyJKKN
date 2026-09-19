// app/api/courses/payments/initiate/route.ts
//
// POST — start an online payment for one or more course instalment bills of
// the SAME enrolment, each for a chosen amount up to that bill's balance.
//
// Called by the participant from /my-courses. Returns what Razorpay Checkout
// needs on the client: the order id, the PUBLIC key id, and the amount.
//
// PARTIAL PAYMENTS: a GPay/UPI transaction is capped well below some course
// fees, so a participant must be able to pay LESS than a bill's full balance
// in one transaction and pay the remainder later. Every requested amount is
// still bounded server-side (0 < amount <= balance_amount) and, below the
// bill's full balance, must clear a MIN_PARTIAL_AMOUNT floor — otherwise a
// bill could be split into dozens of trivial payments. The floor is waived
// when the amount equals the remaining balance exactly, so a small tail
// balance can always be paid off.
//
// MULTIPLE INSTALMENTS, ONE TRANSACTION: the participant may select several
// unpaid bills and pay a custom amount against each in a single Razorpay
// order. One course_bill_payments row is inserted per selected bill, all
// sharing the order's razorpay_order_id/razorpay_account_id but each with
// its own transaction_ref (that column stays UNIQUE per row) and its own
// amount_paid. course_bill_payments_rzp_payment_bill_uniq (composite on
// razorpay_payment_id + bill_id) is what keeps this safe: a bill still can't
// be double-credited for the same payment, but N bills sharing one payment
// is no longer a conflict. All selected bills must belong to the SAME
// enrolment — that keeps the order scoped to one institution's account,
// which the resolver below is pinned to.
//
// THE AMOUNT IS NEVER TAKEN AT FACE VALUE FROM THE CLIENT BEYOND THIS CHECK.
// Every amount is validated against course_bills.balance_amount, read
// server-side. A body-supplied amount is the classic way a checkout gets
// under- or over-paid: the browser is not a trustworthy source for what
// somebody owes, so it is bounded, never trusted outright.
//
// WHICH INSTITUTION GETS THE MONEY: the bills' shared institution_id,
// resolved through the shared vault (resolveRazorpayCredentials → the
// institution's active razorpay_accounts row, falling back to the common env
// account). So a course run by one college is paid into that college's
// merchant account without any per-course configuration.
//
// The chosen account is PINNED onto every payment row as razorpay_account_id,
// so verification later uses the same account that created the order even if
// the institution rotates credentials in between.

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { toPaise } from '@/lib/services/payments/amount';
import { COURSE_FEE_HEAD } from '@/lib/services/payments/fee-heads';
import { MIN_PARTIAL_COURSE_PAYMENT } from '@/lib/services/payments/course-payment-rules';

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

const round2 = (n: number) => Math.round(n * 100) / 100;

export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json().catch(() => ({}));
    const rawPayments = (body ?? {}) as { payments?: Array<{ billId?: string; amount?: number }> };
    const requested = Array.isArray(rawPayments.payments) ? rawPayments.payments : [];

    if (requested.length === 0) {
      return NextResponse.json({ ok: false, error: 'No instalments selected' }, { status: 400 });
    }

    const billIds = requested.map((p) => p.billId).filter((id): id is string => !!id);
    if (billIds.length !== requested.length || new Set(billIds).size !== billIds.length) {
      return NextResponse.json(
        { ok: false, error: 'Each instalment may only be selected once' },
        { status: 400 },
      );
    }

    // Read through the USER's client. RLS on course_bills already allows a
    // participant to see only their own (course_bills_select carries an EXISTS
    // on course_enrollments.profile_id = auth.uid()), so this single read is
    // both the fetch and the authorisation check — there is no way to name
    // somebody else's bill and have it come back.
    const { data: bills, error: readError } = await auth.supabase
      .from('course_bills')
      .select(
        `id, bill_number, installment_no, label, total_amount, paid_amount, balance_amount,
         status, institution_id, enrollment_id,
         enrollment:course_enrollments!course_bills_enrollment_id_fkey(
           id, profile_id, enrollment_number,
           course:course_events!course_enrollments_course_event_id_fkey(title)
         )`,
      )
      .in('id', billIds);

    if (readError) {
      console.error('[courses/pay/initiate] bill read failed:', readError.message);
      return NextResponse.json({ ok: false, error: 'Could not load the bill' }, { status: 500 });
    }
    if (!bills || bills.length !== billIds.length) {
      return NextResponse.json({ ok: false, error: 'Bill not found' }, { status: 404 });
    }

    const rows = bills as any[];

    // Only the person the bills belong to may pay them here. RLS also lets
    // billing STAFF read these rows, and this endpoint is the participant's
    // self-service path — an admin recording a payment goes through the
    // offline flow.
    if (rows.some((b) => b.enrollment?.profile_id !== auth.user.id)) {
      return NextResponse.json(
        { ok: false, error: 'You can only pay your own instalments.' },
        { status: 403 },
      );
    }

    // One order, one institution's merchant account: every selected bill must
    // belong to the same enrolment. Combining bills across courses/colleges
    // would need to split the order across accounts, which Razorpay orders
    // can't do.
    const enrollmentIds = new Set(rows.map((b) => b.enrollment_id));
    if (enrollmentIds.size > 1) {
      return NextResponse.json(
        { ok: false, error: 'Instalments from different courses must be paid separately.' },
        { status: 400 },
      );
    }

    if (rows.some((b) => b.status === 'paid')) {
      return NextResponse.json(
        { ok: false, error: 'One of these instalments is already paid.' },
        { status: 409 },
      );
    }
    if (rows.some((b) => b.status === 'voided')) {
      return NextResponse.json(
        { ok: false, error: 'One of these instalments has been cancelled.' },
        { status: 409 },
      );
    }

    // Validate every requested amount against ITS bill's balance — from the
    // database, not the client. Partial payments are already reflected here
    // by fn_course_recompute_balances.
    const byId = new Map(rows.map((b) => [b.id, b]));
    const entries: { bill: any; amount: number }[] = [];

    for (const p of requested) {
      const bill = byId.get(p.billId!);
      const balance = Number(bill.balance_amount ?? 0);
      const amount = round2(Number(p.amount));

      if (!(balance > 0)) {
        return NextResponse.json(
          { ok: false, error: `There is nothing left to pay on ${bill.bill_number}.` },
          { status: 409 },
        );
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: `Enter a valid amount for ${bill.bill_number}.` },
          { status: 400 },
        );
      }
      if (amount > balance) {
        return NextResponse.json(
          {
            ok: false,
            error: `The amount for ${bill.bill_number} cannot exceed its balance of ₹${balance}.`,
          },
          { status: 400 },
        );
      }
      // The floor only applies to a PARTIAL amount — paying off whatever is
      // left, however small, must always be possible.
      if (amount < MIN_PARTIAL_COURSE_PAYMENT && amount !== balance) {
        return NextResponse.json(
          {
            ok: false,
            error: `A partial payment on ${bill.bill_number} must be at least ₹${MIN_PARTIAL_COURSE_PAYMENT.toLocaleString('en-IN')}, or pay the full balance of ₹${balance}.`,
          },
          { status: 400 },
        );
      }

      entries.push({ bill, amount });
    }

    const institutionId = rows[0].institution_id;
    const totalAmount = round2(entries.reduce((sum, e) => sum + e.amount, 0));

    const admin = serviceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email, phone_number')
      .eq('id', auth.user.id)
      .maybeSingle();
    const p = (profile ?? {}) as any;

    const baseRef = transactionRef();
    const amountPaise = toPaise(totalAmount);

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
            institutionId,
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
          institutionId,
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

      const courseTitle = rows[0].enrollment?.course?.title ?? 'Course';
      const description =
        entries.length === 1
          ? `${courseTitle} — ${entries[0].bill.label || `Instalment ${entries[0].bill.installment_no}`}`
          : `${courseTitle} — ${entries.length} instalments`;

      const order = await provider.createOrder({
        transactionRef: baseRef,
        amountPaise,
        currency: 'INR',
        module: 'courses',
        notes: {
          bill_ids: entries.map((e) => e.bill.id).join(','),
          bill_numbers: entries.map((e) => e.bill.bill_number).join(','),
          enrollment_id: rows[0].enrollment_id,
          transaction_ref: baseRef,
          institution_id: institutionId ?? '',
        },
        description,
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
      // relied on at verify — the gateway reports one captured total for the
      // whole order, not a per-bill breakdown, so this is the only place the
      // split is ever decided.
      const paymentRows = entries.map((e, i) => ({
        bill_id: e.bill.id,
        enrollment_id: e.bill.enrollment_id,
        institution_id: e.bill.institution_id,
        amount_paid: e.amount,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_mode: 'razorpay',
        status: 'initiated',
        transaction_ref: entries.length === 1 ? baseRef : `${baseRef}-${i + 1}`,
        razorpay_order_id: order.gatewayOrderId,
        razorpay_account_id: accountId,
      }));

      const { error: insertError } = await admin
        .from('course_bill_payments')
        .insert(paymentRows as any);

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
        amount: totalAmount,
        currency: 'INR',
        transactionRef: baseRef,
        billNumbers: entries.map((e) => e.bill.bill_number),
        description,
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
