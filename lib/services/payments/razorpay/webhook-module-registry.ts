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

export type WebhookServiceClient = ReturnType<typeof createServiceRoleClient>;

export interface WebhookModuleConfig {
  /** Table holding this module's gateway transactions, keyed by razorpay_order_id. */
  table: string;
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
