// lib/services/payments/course-settlement.ts
//
// Marks every course_bill_payments row of one Razorpay order as paid. Shared by
// the participant's verify callback (app/api/courses/payments/verify) and the
// Razorpay webhook, so whichever arrives first settles the order and the other
// finds nothing left to do.
//
// CUSTOMER-BORNE GATEWAY FEE. The merchant accounts pass the gateway fee on to
// the payer ("Fee bearer: customer"), so a net-banking or card payment captures
// order amount + fee: a ₹1,40,000 order captures ₹1,40,018.88 with
// payment.fee = 1888 paise. UPI carries no fee, which is why only UPI payments
// were recorded while every net-banking payment was left 'initiated' (incident
// 2026-09-22, pay_Tf1JGJEs8rQdSh). The fee is the gateway's, never the
// institution's, so the bill is credited with the amount REQUESTED at initiate
// time — crediting the captured total drove CB-30A99DFC-1 to a -18.88 balance.

import type { SupabaseClient } from '@supabase/supabase-js';

const toPaiseInt = (rupees: number) => Math.round(rupees * 100);

/**
 * True when the captured amount is what was asked for, either exactly or
 * exactly plus the customer-borne gateway fee Razorpay reports on the payment.
 */
export function courseCaptureMatches(
  capturedPaise: number,
  feePaise: number,
  intendedPaise: number,
): boolean {
  if (capturedPaise === intendedPaise) return true;
  return feePaise > 0 && capturedPaise - feePaise === intendedPaise;
}

export type CourseSettlementResult =
  | { outcome: 'not_found' }
  | { outcome: 'amount_mismatch'; capturedPaise: number; feePaise: number; intendedPaise: number }
  | { outcome: 'settled'; updated: number; alreadyRecorded: number }
  | { outcome: 'error'; message: string };

export async function settleCourseOrder(
  admin: SupabaseClient,
  input: {
    orderId: string;
    paymentId: string;
    /** Only the browser callback has one; the webhook does not. */
    signature?: string | null;
    capturedPaise: number;
    feePaise: number;
    gatewayResponse: unknown;
  },
): Promise<CourseSettlementResult> {
  const { data: rows, error: readError } = await admin
    .from('course_bill_payments')
    .select('id, bill_id, status, amount_paid, transaction_ref')
    .eq('razorpay_order_id', input.orderId);

  if (readError) return { outcome: 'error', message: readError.message };
  if (!rows || rows.length === 0) return { outcome: 'not_found' };

  // Each row's amount_paid is the split decided (and bounded by the bill's
  // balance) at initiate time. The gateway reports one total for the order, so
  // it is only cross-checked against the sum, never used to re-split.
  const intendedPaise = rows.reduce((sum, r: any) => sum + toPaiseInt(Number(r.amount_paid ?? 0)), 0);
  if (!courseCaptureMatches(input.capturedPaise, input.feePaise, intendedPaise)) {
    return {
      outcome: 'amount_mismatch',
      capturedPaise: input.capturedPaise,
      feePaise: input.feePaise,
      intendedPaise,
    };
  }

  let updated = 0;
  let alreadyRecorded = 0;

  for (const row of rows as any[]) {
    if (row.status === 'success') {
      alreadyRecorded += 1;
      continue;
    }
    // A refunded row is finished business; a late capture event must not revive it.
    if (row.status === 'refunded') continue;

    // Derived from the row's own UNIQUE transaction_ref, so the receipt number
    // is unique without a counter to race on.
    const receiptNumber = `CR-${String(row.transaction_ref ?? '').replace(/^CP-/, '')}`;

    // The status predicate is the claim: the callback and the webhook can run
    // at the same moment, and only one of them may flip the row. The loser
    // matches zero rows instead of overwriting (e.g. nulling the signature).
    const { data: claimed, error: updateError } = await admin
      .from('course_bill_payments')
      .update({
        status: 'success',
        receipt_number: receiptNumber,
        razorpay_payment_id: input.paymentId,
        ...(input.signature ? { razorpay_signature: input.signature } : {}),
        captured_at: new Date().toISOString(),
        gateway_response: input.gatewayResponse as any,
      })
      .eq('id', row.id)
      .in('status', ['initiated', 'failed'])
      .select('id');

    if (updateError) {
      // 23505 on course_bill_payments_rzp_payment_bill_uniq: this bill is
      // already recorded for this payment id by an earlier call.
      if ((updateError as any).code === '23505') {
        alreadyRecorded += 1;
        continue;
      }
      return { outcome: 'error', message: updateError.message };
    }
    if (claimed && claimed.length > 0) updated += 1;
    else alreadyRecorded += 1;
  }

  return { outcome: 'settled', updated, alreadyRecorded };
}
