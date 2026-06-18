// __tests__/integrations/booking-integration-gating.test.ts
//
// Gating tests for the Universal Booking integration scaffolds. The contract:
// every integration module is ENV-GATED — when its credentials are absent the
// `isXConfigured()` guard returns false AND the create/verify entry points
// fail closed (null / false) WITHOUT throwing or making a network call.
//
// These modules read env at call time (inside isXConfigured / the entry
// points), so vi.stubEnv before each assertion is sufficient — no module
// re-import needed. fetch is stubbed to throw so a leak (a call made despite
// an unconfigured guard) surfaces as a test failure rather than a real network
// hit.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isZoomConfigured,
  createZoomMeeting,
} from '@/lib/services/integrations/zoom-service';
import {
  isTeamsConfigured,
  createTeamsMeeting,
} from '@/lib/services/integrations/teams-service';
import {
  isRazorpayBookingConfigured,
  createBookingOrder,
  verifyBookingPayment,
} from '@/lib/services/integrations/razorpay-booking-service';
import { getBookingPixelConfig } from '@/lib/services/analytics/booking-pixel-service';

const ZOOM_VARS = ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'];
const TEAMS_VARS = [
  'MS_GRAPH_TENANT_ID',
  'MS_GRAPH_CLIENT_ID',
  'MS_GRAPH_CLIENT_SECRET',
  'MS_GRAPH_ORGANIZER_USER_ID',
];
const RAZORPAY_VARS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const PIXEL_VARS = ['NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'NEXT_PUBLIC_META_PIXEL_ID'];

const ALL_VARS = [...ZOOM_VARS, ...TEAMS_VARS, ...RAZORPAY_VARS, ...PIXEL_VARS];

function clearAll() {
  for (const k of ALL_VARS) vi.stubEnv(k, '');
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllEnvs();
  clearAll();
  // Any network call while unconfigured is a leak — make it loud.
  fetchSpy = vi.fn(() => {
    throw new Error('fetch must not be called while integration is unconfigured');
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('zoom-service gating', () => {
  it('isZoomConfigured() is false when env is empty', () => {
    expect(isZoomConfigured()).toBe(false);
  });

  it('is false when only some of the three vars are set', () => {
    vi.stubEnv('ZOOM_ACCOUNT_ID', 'acct');
    vi.stubEnv('ZOOM_CLIENT_ID', 'cid');
    // ZOOM_CLIENT_SECRET still empty
    expect(isZoomConfigured()).toBe(false);
  });

  it('is true only when all three vars are set', () => {
    vi.stubEnv('ZOOM_ACCOUNT_ID', 'acct');
    vi.stubEnv('ZOOM_CLIENT_ID', 'cid');
    vi.stubEnv('ZOOM_CLIENT_SECRET', 'secret');
    expect(isZoomConfigured()).toBe(true);
  });

  it('createZoomMeeting() returns null (no fetch) when unconfigured', async () => {
    const out = await createZoomMeeting({
      topic: 'Demo',
      startIso: '2026-07-01T10:00:00Z',
      durationMin: 30,
      hostEmail: 'host@jkkn.ac.in',
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('teams-service gating', () => {
  it('isTeamsConfigured() is false when env is empty', () => {
    expect(isTeamsConfigured()).toBe(false);
  });

  it('is false when the organizer id is missing but the app creds are set', () => {
    vi.stubEnv('MS_GRAPH_TENANT_ID', 'tid');
    vi.stubEnv('MS_GRAPH_CLIENT_ID', 'cid');
    vi.stubEnv('MS_GRAPH_CLIENT_SECRET', 'secret');
    // MS_GRAPH_ORGANIZER_USER_ID still empty
    expect(isTeamsConfigured()).toBe(false);
  });

  it('is true only when all four vars are set', () => {
    vi.stubEnv('MS_GRAPH_TENANT_ID', 'tid');
    vi.stubEnv('MS_GRAPH_CLIENT_ID', 'cid');
    vi.stubEnv('MS_GRAPH_CLIENT_SECRET', 'secret');
    vi.stubEnv('MS_GRAPH_ORGANIZER_USER_ID', 'organizer@jkkn.ac.in');
    expect(isTeamsConfigured()).toBe(true);
  });

  it('createTeamsMeeting() returns null (no fetch) when unconfigured', async () => {
    const out = await createTeamsMeeting({
      topic: 'Demo',
      startIso: '2026-07-01T10:00:00Z',
      durationMin: 30,
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('razorpay-booking-service gating', () => {
  it('isRazorpayBookingConfigured() is false when env is empty', () => {
    expect(isRazorpayBookingConfigured()).toBe(false);
  });

  it('is false when only the key id is set', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_x');
    // RAZORPAY_KEY_SECRET still empty
    expect(isRazorpayBookingConfigured()).toBe(false);
  });

  it('is true when both key id and secret are set', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_x');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    expect(isRazorpayBookingConfigured()).toBe(true);
  });

  it('createBookingOrder() returns null (no fetch) when unconfigured', async () => {
    const out = await createBookingOrder({ amountPaise: 50000, receipt: 'booking-1' });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('verifyBookingPayment() returns false when unconfigured', () => {
    expect(
      verifyBookingPayment({ orderId: 'order_1', paymentId: 'pay_1', signature: 'sig' }),
    ).toBe(false);
  });

  it('verifyBookingPayment() returns false on missing fields even when configured', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_x');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    expect(verifyBookingPayment({ orderId: '', paymentId: 'pay_1', signature: 'sig' })).toBe(
      false,
    );
  });
});

describe('booking-pixel-service gating', () => {
  it('reports disabled with both ids null when env is empty', () => {
    const cfg = getBookingPixelConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.ga4MeasurementId).toBeNull();
    expect(cfg.metaPixelId).toBeNull();
  });

  it('is enabled when only the GA4 id is set', () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-ABC123');
    const cfg = getBookingPixelConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.ga4MeasurementId).toBe('G-ABC123');
    expect(cfg.metaPixelId).toBeNull();
  });

  it('is enabled when only the Meta Pixel id is set', () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '1234567890');
    const cfg = getBookingPixelConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.metaPixelId).toBe('1234567890');
    expect(cfg.ga4MeasurementId).toBeNull();
  });
});
