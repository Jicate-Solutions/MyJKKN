/**
 * Payment status flow rules for the student-facing confirmation pages.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `/billing/payment/success` and `/billing/payment/failed` each polled the
 * transaction status every 3s and each redirected to the other based on an
 * ad-hoc allow-list of status strings. Two of those lists disagreed:
 *
 *   - the success page redirected away for anything not in
 *     ['success','processing','initiated'], and
 *   - the poller only stopped for ['success','failed','cancelled','refunded'].
 *
 * `expired` (33% of production rows) fell in the gap: it triggered the redirect
 * AND kept polling, so the redirect re-fired every 3 seconds forever. The failed
 * page then redirected back on `success` from inside its render body, stripping
 * every query param on the way, which closed the loop. Students watched the
 * confirmation page bounce after a payment that had actually succeeded
 * (BUG-006021, BUG-005380).
 *
 * The fix is to derive BOTH decisions — "is this terminal?" and "which page
 * belongs to this status?" — from one exhaustive mapping over `PaymentStatus`.
 * The Record below is keyed by the union type, so adding a status to
 * `types/payment-gateway.ts` is a compile error here until it is classified.
 * A value that is not in the union at all (an unmapped gateway string that
 * somehow reached the client) is deliberately treated as 'unknown': it never
 * redirects anywhere and keeps the page on its neutral pending view, because
 * showing "failed" for a payment that actually succeeded is the worst outcome.
 */

import type { PaymentStatus } from '@/types/payment-gateway';

/**
 * What a status means for the confirmation UI.
 *
 * - `succeeded`    money captured; the success page owns it.
 * - `pending`      still moving; whichever page the learner is on should wait.
 * - `unsuccessful` no money was taken and none will be; the failed page owns it.
 * - `unknown`      not a status we recognise; treat as pending, never redirect.
 */
export type PaymentDisposition = 'succeeded' | 'pending' | 'unsuccessful' | 'unknown';

/**
 * Exhaustive over `PaymentStatus`. Do not turn this into a partial Record or an
 * allow-list — the whole bug class came from allow-lists that a new status
 * escaped.
 */
const DISPOSITION_BY_STATUS: Record<PaymentStatus, PaymentDisposition> = {
  initiated: 'pending',
  processing: 'pending',
  success: 'succeeded',
  failed: 'unsuccessful',
  cancelled: 'unsuccessful',
  expired: 'unsuccessful',
  refunded: 'unsuccessful',
};

export function classifyPaymentStatus(
  status: string | null | undefined
): PaymentDisposition {
  if (!status) return 'unknown';
  return DISPOSITION_BY_STATUS[status as PaymentStatus] ?? 'unknown';
}

/**
 * True when no further status transition is expected, so polling can stop.
 * `unknown` is NOT terminal — a status we do not recognise might still settle —
 * but `paymentStatusPollInterval` bounds that case so it cannot poll forever.
 */
export function isTerminalPaymentStatus(status: string | null | undefined): boolean {
  const disposition = classifyPaymentStatus(status);
  return disposition === 'succeeded' || disposition === 'unsuccessful';
}

/**
 * True when the learner is on the success page but the transaction says the
 * payment did not go through, so they belong on the failed page.
 */
export function shouldRedirectToFailedPage(status: string | null | undefined): boolean {
  return classifyPaymentStatus(status) === 'unsuccessful';
}

/**
 * True when the learner is on the failed page but the transaction actually
 * succeeded (webhook landed after the redirect), so they belong on the success
 * page.
 */
export function shouldRedirectToSuccessPage(status: string | null | undefined): boolean {
  return classifyPaymentStatus(status) === 'succeeded';
}

/** Poll cadence for a transaction that has not settled yet. */
export const PAYMENT_STATUS_POLL_INTERVAL_MS = 3000;

/**
 * Hard ceiling on how many times the status endpoint is polled for one
 * transaction. 100 fetches x 3s is ~5 minutes of watching — far longer than the
 * gateway's own callback/webhook latency (the two reported transactions settled
 * in 43s and 56s) — after which an unsettled transaction is almost certainly
 * waiting on a human or a reconciliation job, not on the next 3 seconds. The
 * bound exists so that no status, present or future, can hold a tab in an
 * endless request loop the way `expired` and `initiated` did.
 */
export const MAX_PAYMENT_STATUS_POLLS = 100;

/**
 * How many failed rounds to tolerate before giving up on a status endpoint that
 * keeps erroring (see the learner-403 case in `usePaymentStatus`).
 */
export const MAX_PAYMENT_STATUS_ERROR_ROUNDS = 2;

/**
 * Decides the next poll interval, or `false` to stop polling.
 * Pure so it can be unit tested without React Query or a DOM.
 */
export function paymentStatusPollInterval(input: {
  /** Latest status seen from the endpoint, if any. */
  status?: string | null;
  /** Whether the query is currently in an error state. */
  isErrored?: boolean;
  /** How many error rounds the query has recorded. */
  errorUpdateCount?: number;
  /** Total fetches attempted (successful + errored). */
  fetchCount?: number;
}): number | false {
  if (isTerminalPaymentStatus(input.status)) return false;

  if (
    input.isErrored &&
    (input.errorUpdateCount ?? 0) >= MAX_PAYMENT_STATUS_ERROR_ROUNDS
  ) {
    return false;
  }

  if ((input.fetchCount ?? 0) >= MAX_PAYMENT_STATUS_POLLS) return false;

  return PAYMENT_STATUS_POLL_INTERVAL_MS;
}

/** Query param /learners/my-bills reads to open one receipt's dialog on arrival. */
export const MY_BILLS_RECEIPT_PARAM = 'receipt';

export interface PaymentSuccessLinks {
  /** Where "View Receipt" goes; null while no receipt has been generated. */
  receipt: string | null;
  /** Where "View My Bills" goes. */
  bills: string;
}

/**
 * Destinations for the success page's "View Receipt" / "View My Bills" buttons.
 *
 * A student cannot open `/billing/receipts/[id]` or `/billing/schedule/students/[id]`
 * — both sit behind staff permissions (`billing.receipts.view` et al.), so a
 * learner who had just paid tapped either button and landed on Access Denied
 * (BUG-006167). Students belong on their own self-service page,
 * `/learners/my-bills`, whose receipt dialog carries the PDF download. Staff
 * collecting on a learner's behalf keep the admin pages.
 */
export function buildPaymentSuccessLinks(input: {
  isStudent: boolean;
  receiptId: string | null;
  /** `payment_transactions.student_id` — a learners_profiles.id. */
  studentId?: string | null;
}): PaymentSuccessLinks {
  const { isStudent, receiptId, studentId } = input;

  if (isStudent) {
    const receipt = receiptId
      ? `/learners/my-bills?${new URLSearchParams({
          tab: 'paid',
          [MY_BILLS_RECEIPT_PARAM]: receiptId,
        }).toString()}`
      : null;
    return { receipt, bills: '/learners/my-bills' };
  }

  return {
    receipt: receiptId ? `/billing/receipts/${receiptId}` : null,
    bills: studentId ? `/billing/schedule/students/${studentId}` : '/billing/schedule/students',
  };
}

/**
 * Builds a redirect URL between the two confirmation pages while PRESERVING the
 * query string. The failed page used to rebuild the URL from `transaction_id`
 * alone, discarding `verified`, `verified_status`, `receipt_id`, `amount`,
 * `provider`, `razorpay_order_id` and `razorpay_payment_id` — which is how the
 * success page lost its server-verified verdict and fell back to the DB path
 * that bounced it straight back here.
 */
export function buildPaymentRedirectUrl(
  targetPath: string,
  transactionId: string,
  currentParams: URLSearchParams | string,
  /** Params to drop on the way (e.g. a cancel reason that no longer applies). */
  dropKeys: string[] = []
): string {
  const params = new URLSearchParams(
    typeof currentParams === 'string' ? currentParams : currentParams.toString()
  );
  params.set('transaction_id', transactionId);
  for (const key of dropKeys) params.delete(key);
  const query = params.toString();
  return query ? `${targetPath}?${query}` : targetPath;
}
