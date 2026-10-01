// __tests__/lib/services/payments/ezetap/provider.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn() }));

import { EzetapPosProvider } from '@/lib/services/payments/ezetap/ezetap-pos-provider';
import { EzetapApiError } from '@/lib/services/payments/ezetap/client';
import { toPaise } from '@/lib/services/payments/amount';
import type { EzetapDeviceCredentials } from '@/lib/services/payments/ezetap/types';

const CREDS: EzetapDeviceCredentials = {
  deviceId: 'dev-1',
  institutionId: 'inst-1',
  storeId: 'store-1',
  label: 'Counter 1',
  serial: '38230908450035',
  kind: 'razorpay_pos_soundbox',
  username: '4444001234',
  appKey: 'APPKEY',
  accountLabel: null,
  environment: 'demo',
  isActive: true,
};

function mockFetch(body: unknown, status = 200) {
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as any;
  return calls;
}

describe('EzetapPosProvider', () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('push sends the documented DQR body to the demo host', async () => {
    const calls = mockFetch({ success: true, p2pRequestId: 'P2P1' });
    const res = await new EzetapPosProvider(CREDS).push({
      externalRef: 'IMSDQR-1',
      amountPaise: toPaise(21),
    });
    expect(res.p2pRequestId).toBe('P2P1');
    expect(calls[0].url).toBe('https://demo.ezetap.com/api/3.0/p2padapter/pay');
    expect(calls[0].body).toMatchObject({
      username: '4444001234',
      appKey: 'APPKEY',
      amount: '21.00',
      externalRefNumber: 'IMSDQR-1',
      pushTo: { deviceId: '38230908450035|razorpay_pos_soundbox' },
      mode: 'UPI',
    });
  });

  it('live devices use the production host', async () => {
    const calls = mockFetch({ success: true, p2pRequestId: 'P2P1' });
    await new EzetapPosProvider({ ...CREDS, environment: 'live' }).push({
      externalRef: 'R',
      amountPaise: toPaise(1),
    });
    expect(calls[0].url).toBe('https://www.ezetap.com/api/3.0/p2padapter/pay');
  });

  it('a vendor refusal (HTTP 200, success:false) throws EzetapApiError with the code', async () => {
    mockFetch({ success: false, errorCode: 'EZETAP_0000623', errorMessage: 'Device is busy' });
    const err = await new EzetapPosProvider(CREDS)
      .push({ externalRef: 'R', amountPaise: toPaise(1) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(EzetapApiError);
    expect(err.code).toBe('EZETAP_0000623');
  });

  it('cancel reports a payment already initiated on the device', async () => {
    mockFetch({ success: false, errorCode: 'P2P_PAYMENT_INITIATED' });
    const r = await new EzetapPosProvider(CREDS).cancel('P2P1');
    expect(r).toMatchObject({ cancelled: false, reason: 'payment_initiated' });
  });

  it('cancel carries pushTo and the original request id', async () => {
    const calls = mockFetch({ success: true });
    await new EzetapPosProvider(CREDS).cancel('P2P1');
    expect(calls[0].body).toMatchObject({
      origP2pRequestId: 'P2P1',
      pushTo: { deviceId: '38230908450035|razorpay_pos_soundbox' },
    });
  });
});
