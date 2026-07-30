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

vi.mock('@/lib/services/billing/payment-gateway-service', () => ({
  PaymentGatewayService: {
    processSuccessfulPayment: (...args: unknown[]) => processSuccessfulPayment(...args),
  },
}));

vi.mock('@/lib/services/billing/security/payment-audit-service', () => ({
  PaymentAuditService: {
    logVerificationSuccess: (...args: unknown[]) => logVerificationSuccess(...args),
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
          return { eq: () => Promise.resolve({ error: null }) };
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
});

describe('webhook module registry', () => {
  it('declares a table for every payment module', () => {
    for (const [name, cfg] of Object.entries(WEBHOOK_MODULES)) {
      expect(cfg.table, `${name} must declare a table`).toBeTruthy();
      expect(cfg.terminalStatuses.length).toBeGreaterThan(0);
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
