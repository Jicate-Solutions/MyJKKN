// lib/services/payments/razorpay/webhook-module-registry.ts
//
// One declaration per payment module of everything the Razorpay webhook needs to
// know about it: which table holds its transactions, which statuses are terminal,
// and what happens downstream when a payment is captured.
//
// WHY THIS EXISTS. The webhook previously picked its table with
//     mod === 'billing' ? 'payment_transactions' : 'event_payment_transactions'
// repeated at four call sites, with the module-specific column and side-effect
// differences expressed as `if (mod === 'billing')` blocks alongside them. That
// shape is not merely repetitive — it is unsafe to extend. A THIRD module added to
// PaymentModule silently falls into the `else`, so its payments would be looked up
// in the events table, found missing, and logged as "order not found" while real
// money sat captured at Razorpay. Four sites would have to be edited identically
// for that not to happen, with nothing enforcing it.
//
// `Record<PaymentModule, WebhookModuleConfig>` makes the compiler the enforcer: add
// a member to the union and this file fails to typecheck until the module declares
// how its webhook behaves. Same discipline as the exhaustive switch in factory.ts.

import type { PaymentModule } from '../provider';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { payerDetailsFrom } from './payer-details';

export type WebhookServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * The status words a module's table actually accepts.
 *
 * This exists because the handlers used to write a hardcoded `status: 'success'`.
 * That looked like a shared column set, but it was a coincidence: billing and
 * events happen to use the same vocabulary. `ims_gateway_payments` has its own
 * CHECK constraint (initiated|paid|failed|expired|cancelled|amount_mismatch), so a
 * hardcoded 'success' there is not a mismatched label — it is a constraint
 * violation on every capture, leaving money taken and the row never marked paid.
 *
 * Making the vocabulary part of the declaration means a new module cannot join the
 * order path without stating which words its table understands.
 */
export interface WebhookStatusVocabulary {
  /** Written when Razorpay confirms the money is captured. */
  captured: string;
  /**
   * Written on payment.authorized (auto-capture makes this transient).
   * Undefined means the module has no such intermediate state and the handler
   * skips it rather than writing a word the table would reject.
   */
  authorized?: string;
  /** Written on payment.failed. */
  failed: string;
  /**
   * Written when the captured amount does not equal the expected amount.
   * Only meaningful together with `amountPaiseColumn`.
   */
  mismatch?: string;
}

export interface WebhookModuleConfig {
  /** Table holding this module's gateway transactions. */
  table: string;
  /** The status words this module's table accepts. See WebhookStatusVocabulary. */
  statuses: WebhookStatusVocabulary;
  /**
   * Column receiving the capture timestamp. Undefined means don't write one —
   * billing and events have `captured_at`; IMS records `paid_at` instead and
   * declares it here.
   */
  capturedAtColumn?: string;
  /**
   * Column holding the amount we EXPECTED, in paise. When set, payment.captured
   * compares it against what Razorpay actually captured and refuses to finalize a
   * mismatch.
   *
   * Left undefined for billing and events deliberately: adding the check there
   * would change behaviour in a module this work is not allowed to disturb. It is
   * a real gap on their side and is being raised separately — but it is theirs to
   * close, and IMS must not inherit it just because it shares the handler.
   */
  amountPaiseColumn?: string;
  /**
   * Refuse to write a failure over a row that is already terminal.
   *
   * Opt-in rather than universal. Razorpay allows several payment attempts against
   * one order, so a `payment.failed` for an abandoned first attempt can arrive
   * AFTER the retry succeeded — flipping a paid row to failed. For a counter sale
   * that means a customer who has paid, a row that says failed, and no sale. The
   * flag is not switched on for billing/events only because changing their
   * behaviour is out of scope here, not because it is safe there.
   */
  guardTerminalOnFailure?: boolean;
  /**
   * Column holding the Razorpay ORDER id, for modules that collect through orders
   * (hosted checkout). Undefined for order-less flows: a QR-code payment carries no
   * order_id at all, so the order-keyed handlers must skip such a module rather than
   * query a column that does not exist.
   */
  orderIdColumn?: string;
  /** Column holding the Razorpay QR-code id, for modules that collect by QR. */
  qrCodeIdColumn?: string;
  /**
   * Statuses that already represent a finished payment. A webhook arriving for a
   * row in one of these is a replay (Razorpay retries) and must be ignored, or the
   * downstream side-effect runs twice.
   */
  terminalStatuses: readonly string[];
  /** Columns to write on capture beyond the shared set, if the module needs any. */
  capturedExtraColumns?: (payment: any, capturedAtIso: string) => Record<string, unknown>;
  /** Columns to write on failure beyond the shared set, if the module needs any. */
  failedExtraColumns?: () => Record<string, unknown>;
  /**
   * The module's real work once the money is confirmed — issue a receipt, mark a
   * registration paid, book a sale. Runs with the SERVICE-ROLE client: a webhook has
   * no user session, so a cookie-scoped client reads zero rows through RLS.
   */
  onCaptured?: (
    supabase: WebhookServiceClient,
    rowId: string,
    payment: any,
    payload: any,
  ) => Promise<void>;
}

export const WEBHOOK_MODULES: Record<PaymentModule, WebhookModuleConfig> = {
  billing: {
    table: 'payment_transactions',
    orderIdColumn: 'razorpay_order_id',
    statuses: { captured: 'success', authorized: 'processing', failed: 'failed' },
    capturedAtColumn: 'captured_at',
    terminalStatuses: ['success', 'refunded'],
    capturedExtraColumns: (payment, capturedAtIso) => ({
      payment_date: capturedAtIso,
      completed_at: new Date().toISOString(),
      // Mirror the payment id into gateway_transaction_id, which is what the
      // callback path writes and what the receipt's payment_reference_number is
      // built from. Keeping both columns in step is what makes receipt creation
      // idempotent no matter which path finalizes the payment first.
      gateway_transaction_id: payment.id,
      payment_method: payment.method ?? null,
    }),
    failedExtraColumns: () => ({
      completed_at: new Date().toISOString(),
    }),
    onCaptured: async (supabase, rowId, _payment, _payload) => {
      // Imported lazily: payment-gateway-service is ~1700 lines and pulls in the
      // whole billing stack, which the events/ims paths have no use for.
      const { PaymentGatewayService } = await import('@/lib/services/billing/payment-gateway-service');
      const { data: txn } = await (supabase as any)
        .from('payment_transactions')
        .select('*')
        .eq('id', rowId)
        .single();
      if (txn) {
        // Pass the service-role client: this runs with no user session, so a
        // cookie-scoped client would read zero transaction items through RLS and
        // silently skip receipt creation (bill left unpaid).
        await PaymentGatewayService.processSuccessfulPayment(txn, supabase as any);
      }
    },
  },

  events: {
    table: 'event_payment_transactions',
    orderIdColumn: 'razorpay_order_id',
    statuses: { captured: 'success', authorized: 'processing', failed: 'failed' },
    capturedAtColumn: 'captured_at',
    terminalStatuses: ['success', 'refunded'],
    onCaptured: async (supabase, rowId) => {
      // Mark the linked registration paid (mirror the callback success side-effect).
      const { data: txn } = await (supabase as any)
        .from('event_payment_transactions')
        .select('registration_id')
        .eq('id', rowId)
        .single();
      if (txn?.registration_id) {
        await (supabase as any)
          .from('events_registrations')
          .update({ payment_status: 'paid' })
          .eq('id', txn.registration_id);
      }
    },
  },

  ims: {
    // Counter sales, collected through hosted checkout — so BOTH keys are declared:
    //
    //   orderIdColumn  — the live path. The QR Codes API is not provisioned on this
    //                    merchant account, so the counter collects via an order and
    //                    the credit arrives as payment.captured.
    //   qrCodeIdColumn — kept, not vestigial. qr_code.credited still routes, so the
    //                    day Razorpay enables the QR API that flow works untouched.
    table: 'ims_gateway_payments',
    orderIdColumn: 'razorpay_order_id',
    qrCodeIdColumn: 'razorpay_qr_code_id',

    // This table's own vocabulary. 'success' and 'processing' would be rejected by
    // its CHECK constraint — see WebhookStatusVocabulary.
    statuses: { captured: 'paid', failed: 'failed', mismatch: 'amount_mismatch' },
    // No `authorized`: auto-capture makes it transient, and writing an unsupported
    // word to satisfy a moment nobody observes would only risk a failed update.
    capturedAtColumn: 'paid_at',

    // Counter takings are amount-checked. Booking a sale for a different figure
    // than was collected is worse than making a human look at it.
    amountPaiseColumn: 'amount_paise',
    guardTerminalOnFailure: true,

    // 'paid' means Razorpay reported the credit. amount_mismatch is terminal too:
    // it needs a human, and must never be quietly overwritten by a retry.
    terminalStatuses: ['paid', 'amount_mismatch', 'cancelled'],

    // The payer columns come from the SHARED extractor, so the webhook records
    // exactly what the callback and the cashier's poll record. Three paths can
    // confirm a counter payment; which one wins is a race the user cannot see, so
    // it must not change the answer to "who paid?".
    capturedExtraColumns: (payment) => ({
      captured_amount_paise: Number(payment.amount ?? 0),
      ...payerDetailsFrom(payment),
    }),

    // No onCaptured. The sale is booked by the CASHIER'S poll (or the callback),
    // not here — those requests carry a real session, so ims_pos_checkout's
    // auth.uid() guard holds and nothing needs a service-role bypass. The webhook's
    // job is only to make "the money arrived" a fact the poll can act on.
  },
};

/**
 * Every module's transaction table, in declaration order.
 *
 * Used by the refund handler, which has no `module` note to route on and so must
 * probe each table by razorpay_payment_id. Derived from the registry rather than
 * hardcoded so a new module is covered automatically; object key order is
 * insertion order for string keys, which preserves the original
 * "billing first, then events" probe sequence.
 */
export const WEBHOOK_TRANSACTION_TABLES: readonly string[] = (
  Object.keys(WEBHOOK_MODULES) as PaymentModule[]
).map((m) => WEBHOOK_MODULES[m].table);

/** Type guard for the untrusted `notes.module` string on a gateway payload. */
export function isPaymentModule(value: unknown): value is PaymentModule {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEBHOOK_MODULES, value);
}
