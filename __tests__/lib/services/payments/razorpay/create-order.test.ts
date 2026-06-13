// __tests__/lib/services/payments/razorpay/create-order.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOrder } from '@/lib/services/payments/razorpay/create-order';
import { toPaise } from '@/lib/services/payments/amount';

describe('createOrder', () => {
  const origFetch = globalThis.fetch;
  const AUTH = { keyId: 'rzp_test_KEY', keySecret: 'SECRET' };
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('POSTs to /orders with amount in paise and payment_capture=1', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        id: 'order_TESTID',
        entity: 'order',
        amount: 50000,
        amount_paid: 0,
        amount_due: 50000,
        currency: 'INR',
        receipt: 'TXN-1',
        status: 'created',
        attempts: 0,
        notes: { module: 'billing' },
        created_at: 1700000000,
      }), { status: 200 });
    }) as typeof globalThis.fetch;

    const result = await createOrder({
      transactionRef: 'TXN-1',
      amountPaise: toPaise(500),
      currency: 'INR',
      module: 'billing',
      notes: { internal_id: 'abc' },
    }, AUTH);

    expect(result.id).toBe('order_TESTID');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/orders');
    // Basic auth header is built from the injected credentials, not env.
    const authHeader = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(authHeader).toBe('Basic ' + Buffer.from('rzp_test_KEY:SECRET').toString('base64'));
    const body = (calls[0].init.body as string);
    expect(body).toContain('amount=50000');
    expect(body).toContain('currency=INR');
    expect(body).toContain('receipt=TXN-1');
    expect(body).toContain('payment_capture=1');
    expect(body).toContain('notes%5Bmodule%5D=billing');
  });
});
