/**
 * Tests for the Razorpay QR Codes API client.
 *
 * The whole risk in this file is the REQUEST SHAPE — Razorpay accepts a
 * form-encoded body, and a wrong or missing field fails in ways that only show up
 * as a live payment behaving badly. Three fields carry real consequences:
 *
 *   - usage=single_use   — the gateway's own guarantee against a double charge
 *   - fixed_amount+payment_amount — stops the customer editing what they pay
 *   - notes[module]      — the ONLY thing the webhook can route on; without it a
 *                          credited payment cannot be attributed and is stranded
 *
 * So these assert the exact params sent, with the HTTP layer stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const razorpayRequest = vi.fn();

vi.mock('@/lib/services/payments/razorpay/client', () => ({
  razorpayRequest: (...args: unknown[]) => razorpayRequest(...args),
}));

import {
  createQrCode,
  getQrCode,
  getQrCodePayments,
  closeQrCode,
} from '@/lib/services/payments/razorpay/qr-code';

const AUTH = { keyId: 'rzp_test_abc', keySecret: 'secret' };

/** Pull the URLSearchParams the client would have posted. */
function sentParams(): URLSearchParams {
  const body = razorpayRequest.mock.calls[0][3];
  expect(body).toBeInstanceOf(URLSearchParams);
  return body as URLSearchParams;
}

beforeEach(() => {
  razorpayRequest.mockReset();
  razorpayRequest.mockResolvedValue({ id: 'qr_TEST1', entity: 'qr_code', status: 'active' });
});

describe('createQrCode', () => {
  const base = {
    transactionRef: 'IMSPOS-0001',
    amountPaise: 250000 as never,
    module: 'billing' as const,
    closeBy: 1780000900,
    name: 'JKKN Store',
  };

  it('POSTs to the qr_codes endpoint', async () => {
    await createQrCode(base, AUTH);
    expect(razorpayRequest).toHaveBeenCalledTimes(1);
    const [method, path, auth] = razorpayRequest.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/payments/qr_codes');
    expect(auth).toBe(AUTH);
  });

  it('requests a single-use, fixed-amount UPI QR', async () => {
    await createQrCode(base, AUTH);
    const p = sentParams();
    expect(p.get('type')).toBe('upi_qr');
    // Gateway-enforced anti-double-charge. If this ever ships as multiple_use a
    // customer could pay the same QR twice.
    expect(p.get('usage')).toBe('single_use');
    expect(p.get('fixed_amount')).toBe('true');
    expect(p.get('payment_amount')).toBe('250000');
    expect(p.get('close_by')).toBe('1780000900');
    expect(p.get('name')).toBe('JKKN Store');
  });

  it('always stamps notes[module] so the webhook can route the credit', async () => {
    await createQrCode({ ...base, module: 'events' }, AUTH);
    expect(sentParams().get('notes[module]')).toBe('events');
  });

  it('echoes our transaction ref into the notes', async () => {
    await createQrCode(base, AUTH);
    expect(sentParams().get('notes[transaction_ref]')).toBe('IMSPOS-0001');
  });

  it('passes caller notes through alongside the reserved ones', async () => {
    await createQrCode({ ...base, notes: { store_id: 'store-7' } }, AUTH);
    const p = sentParams();
    expect(p.get('notes[store_id]')).toBe('store-7');
    expect(p.get('notes[module]')).toBe('billing');
  });

  it('never lets caller notes displace notes[module]', async () => {
    // A caller passing `module` in notes must not be able to redirect routing —
    // the reserved key is written first and the loop uses set(), so verify the
    // final value is the real module.
    await createQrCode({ ...base, module: 'billing', notes: {} }, AUTH);
    expect(sentParams().get('notes[module]')).toBe('billing');
  });

  it('clamps an over-long note value to Razorpay\'s limit', async () => {
    await createQrCode({ ...base, notes: { blob: 'x'.repeat(500) } }, AUTH);
    expect(sentParams().get('notes[blob]')!.length).toBe(240);
  });

  it('caps the number of notes Razorpay will accept', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 30; i++) many[`k${i}`] = 'v';
    await createQrCode({ ...base, notes: many }, AUTH);
    const keys = [...sentParams().keys()].filter((k) => k.startsWith('notes['));
    expect(keys.length).toBeLessThanOrEqual(15);
  });

  it('omits description when not supplied', async () => {
    await createQrCode(base, AUTH);
    expect(sentParams().has('description')).toBe(false);
  });
});

describe('QR read + close helpers', () => {
  it('getQrCode GETs the single QR', async () => {
    await getQrCode('qr_A1', AUTH);
    const [method, path] = razorpayRequest.mock.calls[0];
    expect(method).toBe('GET');
    expect(path).toBe('/payments/qr_codes/qr_A1');
  });

  it('getQrCodePayments unwraps the collection items', async () => {
    razorpayRequest.mockResolvedValue({
      entity: 'collection',
      count: 1,
      items: [{ id: 'pay_1', amount: 250000 }],
    });
    const items = await getQrCodePayments('qr_A1', AUTH);
    expect(razorpayRequest.mock.calls[0][1]).toBe('/payments/qr_codes/qr_A1/payments');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('pay_1');
  });

  it('getQrCodePayments returns [] when the collection is empty or malformed', async () => {
    razorpayRequest.mockResolvedValue({});
    expect(await getQrCodePayments('qr_A1', AUTH)).toEqual([]);
  });

  it('closeQrCode POSTs to the close endpoint', async () => {
    await closeQrCode('qr_A1', AUTH);
    const [method, path] = razorpayRequest.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/payments/qr_codes/qr_A1/close');
  });
});
