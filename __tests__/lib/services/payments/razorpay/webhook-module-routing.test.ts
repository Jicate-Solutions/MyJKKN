/**
 * Regression tests for the Razorpay webhook's module routing.
 *
 * The dispatch logic decides which table a confirmed payment lands in and which
 * downstream side-effect runs — issue a receipt, mark a registration paid. It had
 * no test at all, while picking its table with
 *   mod === 'billing' ? 'payment_transactions' : 'event_payment_transactions'
 * at four separate call sites. Any third module fell into the `else` and would have
 * been looked up in the events table, logged as "order not found", and left as real
 * money captured at Razorpay against an untouched row.
 *
 * These tests pin the behaviour that the registry refactor had to preserve, so the
 * refactor is provable rather than asserted. `supabase` is a parameter of
 * dispatchRazorpayWebhook, so no database is needed — only a chainable stub that
 * records what would have been written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const processSuccessfulPayment = vi.fn().mockResolvedValue(true);
const logVerificationSuccess = vi.fn().mockResolvedValue(undefined);
const logAmountMismatch = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/services/billing/payment-gateway-service', () => ({
  PaymentGatewayService: {
    processSuccessfulPayment: (...args: unknown[]) => processSuccessfulPayment(...args),
  },
}));

vi.mock('@/lib/services/billing/security/payment-audit-service', () => ({
  PaymentAuditService: {
    logVerificationSuccess: (...args: unknown[]) => logVerificationSuccess(...args),
    logAmountMismatch: (...args: unknown[]) => logAmountMismatch(...args),
    logInvalidWebhookSignature: vi.fn(),
  },
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dispatchRazorpayWebhook } from '@/lib/services/payments/razorpay/webhook-handlers';
import {
  WEBHOOK_MODULES,
  WEBHOOK_TRANSACTION_TABLES,
  isPaymentModule,
} from '@/lib/services/payments/razorpay/webhook-module-registry';

interface Recorded {
  table: string;
  values: Record<string, unknown>;
}

/**
 * Minimal chainable Supabase stub. `rows` maps table name -> the row `.single()`
 * should return (null means "no such row"), so a test can make one module's table
 * miss and another's hit.
 */
function makeClient(rows: Record<string, unknown> = {}) {
  const updates: Recorded[] = [];
  const inserts: Recorded[] = [];
  const selectedTables: string[] = [];

  const client = {
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
        upsert(values: Record<string, unknown>) {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
        select(_columns?: string) {
          selectedTables.push(table);
          const q: Record<string, unknown> = {
            eq: () => q,
            single: () => Promise.resolve({ data: rows[table] ?? null }),
            maybeSingle: () => Promise.resolve({ data: rows[table] ?? null }),
          };
          return q;
        },
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          // payment.captured claims the row with
          //   .update(...).eq('id', ...).not('status','in',(terminal...)).select('id')
          // so that exactly one concurrent invocation flips it and runs the
          // side-effect; the loser matches zero rows. The chain is thenable so
          // the older `await update(...).eq(...)` call sites keep resolving as
          // they did, while the claim path resolves to one row = this call won.
          const chain: Record<string, unknown> = {
            not: () => chain,
            select: () => Promise.resolve({ data: [{ id: 'claimed' }], error: null }),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve, reject),
          };
          return { eq: () => chain };
        },
      };
    },
  };

  return { client, updates, inserts, selectedTables };
}

const capturedPayload = (module: string) => ({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_TEST123',
        order_id: 'order_TEST123',
        amount: 250000,
        method: 'upi',
        created_at: 1780000000,
        notes: { module },
      },
    },
    order: { entity: { id: 'order_TEST123', notes: { module } } },
  },
});

beforeEach(() => {
  processSuccessfulPayment.mockClear();
  logVerificationSuccess.mockClear();
  logAmountMismatch.mockClear();
});

describe('webhook module registry', () => {
  it('declares a table for every payment module', () => {
    for (const [name, cfg] of Object.entries(WEBHOOK_MODULES)) {
      expect(cfg.table, `${name} must declare a table`).toBeTruthy();
      expect(cfg.terminalStatuses.length).toBeGreaterThan(0);
      // The status vocabulary is per-table, not shared. See the ims describe block.
      expect(cfg.statuses?.captured, `${name} must declare a captured status`).toBeTruthy();
      expect(cfg.statuses?.failed, `${name} must declare a failed status`).toBeTruthy();
    }
  });

  it('declares the amount-check pair together or not at all', () => {
    for (const [name, cfg] of Object.entries(WEBHOOK_MODULES)) {
      // amountPaiseColumn without a mismatch status would compare and then have
      // nowhere to record the answer — the check would silently do nothing.
      if (cfg.amountPaiseColumn) {
        expect(cfg.statuses.mismatch, `${name} checks amounts so it needs a mismatch status`).toBeTruthy();
      }
    }
  });

  it('probes refund tables in declaration order — billing before events', () => {
    expect(WEBHOOK_TRANSACTION_TABLES[0]).toBe('payment_transactions');
    expect(WEBHOOK_TRANSACTION_TABLES).toContain('event_payment_transactions');
  });

  it('rejects an unknown module note', () => {
    expect(isPaymentModule('billing')).toBe(true);
    expect(isPaymentModule('events')).toBe(true);
    expect(isPaymentModule('nope')).toBe(false);
    expect(isPaymentModule(undefined)).toBe(false);
  });
});

describe('payment.captured routing', () => {
  it('routes a billing payment to payment_transactions and issues the receipt', async () => {
    const { client, updates } = makeClient({
      payment_transactions: { id: 'txn-1', status: 'initiated' },
    });

    await dispatchRazorpayWebhook(client as never, capturedPayload('billing'));

    const txnUpdate = updates.find((u) => u.table === 'payment_transactions');
    expect(txnUpdate).toBeDefined();
    expect(txnUpdate!.values.status).toBe('success');
    expect(txnUpdate!.values.razorpay_payment_id).toBe('pay_TEST123');
    // Billing-only columns — the receipt's payment_reference_number is built from
    // gateway_transaction_id, so it must stay in step with razorpay_payment_id.
    expect(txnUpdate!.values.gateway_transaction_id).toBe('pay_TEST123');
    expect(txnUpdate!.values.payment_method).toBe('upi');
    expect(txnUpdate!.values.payment_date).toBeDefined();
    expect(txnUpdate!.values.completed_at).toBeDefined();

    expect(processSuccessfulPayment).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.table === 'event_payment_transactions')).toBe(false);
  });

  it('routes an events payment to event_payment_transactions and marks the registration paid', async () => {
    const { client, updates } = makeClient({
      event_payment_transactions: { id: 'etxn-1', status: 'initiated', registration_id: 'reg-9' },
    });

    await dispatchRazorpayWebhook(client as never, capturedPayload('events'));

    const txnUpdate = updates.find((u) => u.table === 'event_payment_transactions');
    expect(txnUpdate).toBeDefined();
    expect(txnUpdate!.values.status).toBe('success');
    // Billing-only columns must NOT be written for events.
    expect(txnUpdate!.values.gateway_transaction_id).toBeUndefined();
    expect(txnUpdate!.values.payment_method).toBeUndefined();

    const regUpdate = updates.find((u) => u.table === 'events_registrations');
    expect(regUpdate?.values.payment_status).toBe('paid');

    expect(processSuccessfulPayment).not.toHaveBeenCalled();
    expect(updates.some((u) => u.table === 'payment_transactions')).toBe(false);
  });

  it('is idempotent: a row already terminal is skipped entirely', async () => {
    const { client, updates } = makeClient({
      payment_transactions: { id: 'txn-1', status: 'success' },
    });

    await dispatchRazorpayWebhook(client as never, capturedPayload('billing'));

    expect(updates.some((u) => u.table === 'payment_transactions')).toBe(false);
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('writes nothing when the module note is absent or unknown', async () => {
    const { client, updates } = makeClient({
      payment_transactions: { id: 'txn-1', status: 'initiated' },
      event_payment_transactions: { id: 'etxn-1', status: 'initiated' },
    });

    await dispatchRazorpayWebhook(client as never, capturedPayload('not_a_module'));

    // The pre-registry code would also have bailed here, but only because the note
    // failed an equality check. The point of the registry is that a REAL third
    // module cannot silently land in the events table instead.
    expect(updates.some((u) => u.table === 'payment_transactions')).toBe(false);
    expect(updates.some((u) => u.table === 'event_payment_transactions')).toBe(false);
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('logs every event to razorpay_webhook_events for idempotency', async () => {
    const { client, inserts } = makeClient({
      payment_transactions: { id: 'txn-1', status: 'initiated' },
    });

    await dispatchRazorpayWebhook(client as never, capturedPayload('billing'));

    const logged = inserts.find((i) => i.table === 'razorpay_webhook_events');
    expect(logged?.values.event_type).toBe('payment.captured');
  });
});

describe('payment.failed routing', () => {
  const failedPayload = (module: string) => ({
    event: 'payment.failed',
    payload: {
      payment: { entity: { id: 'pay_F1', order_id: 'order_F1', notes: { module } } },
      order: { entity: { id: 'order_F1', notes: { module } } },
    },
  });

  it('adds completed_at for billing but not for events', async () => {
    const billing = makeClient();
    await dispatchRazorpayWebhook(billing.client as never, failedPayload('billing'));
    const bUpdate = billing.updates.find((u) => u.table === 'payment_transactions');
    expect(bUpdate!.values.status).toBe('failed');
    expect(bUpdate!.values.completed_at).toBeDefined();

    const events = makeClient();
    await dispatchRazorpayWebhook(events.client as never, failedPayload('events'));
    const eUpdate = events.updates.find((u) => u.table === 'event_payment_transactions');
    expect(eUpdate!.values.status).toBe('failed');
    expect(eUpdate!.values.completed_at).toBeUndefined();
  });
});

/**
 * IMS counter sales joined the ORDER path when it turned out the QR Codes API is
 * not provisioned on the merchant account. That is not a free move: the shared
 * "captured" write used to hardcode `status: 'success'` and `captured_at`, and
 * ims_gateway_payments accepts neither — its CHECK constraint allows
 * initiated|paid|failed|expired|cancelled|amount_mismatch, and its timestamp column
 * is paid_at. A hardcoded 'success' there is not a cosmetic mismatch; it is a
 * constraint violation on every capture, i.e. money taken and the row never marked
 * paid. These tests pin the vocabulary each module's table actually accepts.
 */
describe('ims order-path routing', () => {
  const imsPayload = (amount: number) => ({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_IMS1',
          order_id: 'order_IMS1',
          amount,
          method: 'upi',
          created_at: 1780000000,
          notes: { module: 'ims' },
        },
      },
      order: { entity: { id: 'order_IMS1', notes: { module: 'ims' } } },
    },
  });

  it("writes the ims table's own status words, not billing's", async () => {
    const { client, updates } = makeClient({
      ims_gateway_payments: { id: 'gp-1', status: 'initiated', amount_paise: 250000 },
    });

    await dispatchRazorpayWebhook(client as never, imsPayload(250000));

    const upd = updates.find((u) => u.table === 'ims_gateway_payments');
    expect(upd).toBeDefined();
    expect(upd!.values.status).toBe('paid');            // NOT 'success'
    expect(upd!.values.paid_at).toBeDefined();          // NOT captured_at
    expect(upd!.values.captured_at).toBeUndefined();
    expect(upd!.values.captured_amount_paise).toBe(250000);
    expect(upd!.values.razorpay_payment_id).toBe('pay_IMS1');

    // The webhook records the money and stops. Booking the sale needs auth.uid(),
    // which a webhook has no way to supply — the cashier's poll does that.
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('refuses to finalize when the captured amount does not match the bill', async () => {
    const { client, updates } = makeClient({
      ims_gateway_payments: { id: 'gp-2', status: 'initiated', amount_paise: 250000 },
    });

    await dispatchRazorpayWebhook(client as never, imsPayload(100));

    const upd = updates.find((u) => u.table === 'ims_gateway_payments');
    expect(upd!.values.status).toBe('amount_mismatch');
    expect(upd!.values.captured_amount_paise).toBe(100);
    expect(logAmountMismatch).toHaveBeenCalledTimes(1);
    // Never reported as a verified success — a human decides this one.
    expect(logVerificationSuccess).not.toHaveBeenCalled();
  });

  it('leaves billing and events unchecked on amount — that gap is theirs, not ours to inherit', async () => {
    const { client, updates } = makeClient({
      payment_transactions: { id: 'txn-1', status: 'initiated', amount_paise: 999 },
    });

    // Captured 250000 against an expected 999: billing declares no amount column,
    // so it finalizes exactly as it did before this change.
    await dispatchRazorpayWebhook(client as never, capturedPayload('billing'));

    const upd = updates.find((u) => u.table === 'payment_transactions');
    expect(upd!.values.status).toBe('success');
    expect(upd!.values.captured_at).toBeDefined();
    expect(logAmountMismatch).not.toHaveBeenCalled();
  });

  it('skips payment.authorized entirely — ims has no intermediate status', async () => {
    const { client, updates } = makeClient({
      ims_gateway_payments: { id: 'gp-3', status: 'initiated', amount_paise: 250000 },
    });

    await dispatchRazorpayWebhook(client as never, {
      event: 'payment.authorized',
      payload: {
        payment: { entity: { id: 'pay_IMS2', order_id: 'order_IMS1', notes: { module: 'ims' } } },
        order: { entity: { id: 'order_IMS1', notes: { module: 'ims' } } },
      },
    });

    // 'processing' would be rejected by the CHECK constraint, and auto-capture
    // follows immediately, so there is nothing worth recording.
    expect(updates.some((u) => u.table === 'ims_gateway_payments')).toBe(false);
  });

  it('does not write a failure over a row that is already paid', async () => {
    const { client, updates } = makeClient({
      ims_gateway_payments: { id: 'gp-4', status: 'paid', amount_paise: 250000 },
    });

    // Razorpay allows several attempts against one order, so a failure event for an
    // abandoned first attempt can land after the retry succeeded. Overwriting would
    // leave a customer who paid, a row saying failed, and no sale.
    await dispatchRazorpayWebhook(client as never, {
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: 'pay_IMS3', order_id: 'order_IMS1', notes: { module: 'ims' } } },
        order: { entity: { id: 'order_IMS1', notes: { module: 'ims' } } },
      },
    });

    expect(updates.some((u) => u.table === 'ims_gateway_payments')).toBe(false);
  });

  it('still routes qr_code.credited — the QR path is dormant, not deleted', async () => {
    const { client, updates } = makeClient({
      ims_gateway_payments: { id: 'gp-5', status: 'initiated', amount_paise: 250000 },
    });

    await dispatchRazorpayWebhook(client as never, {
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: 'qr_1', notes: { module: 'ims', gateway_payment_id: 'gp-5' } } },
        payment: { entity: { id: 'pay_QR1', amount: 250000, created_at: 1780000000 } },
      },
    });

    const upd = updates.find((u) => u.table === 'ims_gateway_payments');
    expect(upd!.values.status).toBe('paid');
  });
});

describe('refund routing', () => {
  it('falls through to the events table when billing has no matching payment', async () => {
    const { client, updates } = makeClient({
      payment_transactions: null,
      event_payment_transactions: { id: 'etxn-1', status: 'success' },
    });

    await dispatchRazorpayWebhook(client as never, {
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_TEST123', status: 'processed' } } },
    });

    const refundUpdate = updates.find((u) => u.table === 'event_payment_transactions');
    expect(refundUpdate?.values.status).toBe('refunded');
    expect(refundUpdate?.values.refund_status).toBe('processed');
  });
});
