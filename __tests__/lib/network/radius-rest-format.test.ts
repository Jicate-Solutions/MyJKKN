import { describe, it, expect } from 'vitest';
import { formatMikrotikRateLimit, toRlmRestReply } from '@/lib/services/network/radius-rest-format';
import { decideNetworkAccess } from '@/lib/services/network/radius-decision';
import type { NetworkBandwidthTier, NetworkDecisionInput } from '@/types/network';

const TIERS: NetworkBandwidthTier[] = [
  { code: 'tier_a', attendanceMinPct: 95, attendanceMaxPct: 100, downloadMbps: 50, uploadMbps: 25 },
  { code: 'tier_b', attendanceMinPct: 85, attendanceMaxPct: 95, downloadMbps: 25, uploadMbps: 12 },
  { code: 'tier_c', attendanceMinPct: 75, attendanceMaxPct: 85, downloadMbps: 10, uploadMbps: 5 },
  { code: 'tier_d', attendanceMinPct: 0, attendanceMaxPct: 75, downloadMbps: 5, uploadMbps: 2 },
];

const BASE: NetworkDecisionInput = {
  identity: { profileId: 'p-1', role: 'learner', institutionId: 'i-1' },
  attendancePct: 97,
  feeOverdue: false,
  lockedUntil: null,
  activeDeviceCount: 0,
  maxDevicesForRole: 3,
  tiers: TIERS,
  sessionHoursByRole: { learner: 8, senior_learner: 24, warden: 0 },
  emergencyOpen: false,
  now: '2026-09-06T00:00:00.000Z',
};

describe('formatMikrotikRateLimit', () => {
  it('renders rx/tx = UPLOAD first, then DOWNLOAD (MikroTik reads rx from the router side)', () => {
    expect(formatMikrotikRateLimit({ code: 'tier_a', downloadMbps: 50, uploadMbps: 25 })).toBe('25M/50M');
    expect(formatMikrotikRateLimit({ code: 'tier_c', downloadMbps: 10, uploadMbps: 5 })).toBe('5M/10M');
  });

  it('is never the inverted May 2026 string for an asymmetric tier', () => {
    expect(formatMikrotikRateLimit({ code: 'tier_a', downloadMbps: 50, uploadMbps: 25 })).not.toBe('50M/25M');
  });
});

describe('toRlmRestReply — the shape FreeRADIUS 3.2 rlm_rest accepted in May 2026', () => {
  it('accept -> HTTP 200 with reply attributes (scenario 1)', () => {
    expect(toRlmRestReply(decideNetworkAccess(BASE))).toEqual({
      status: 200,
      body: {
        'Mikrotik-Rate-Limit': '25M/50M',
        'Mikrotik-Group': 'tier_a_learner',
        'Session-Timeout': 28800,
      },
    });
  });

  it('accept tier_c (scenario 2)', () => {
    expect(toRlmRestReply(decideNetworkAccess({ ...BASE, attendancePct: 78 })).body).toEqual({
      'Mikrotik-Rate-Limit': '5M/10M',
      'Mikrotik-Group': 'tier_c_learner',
      'Session-Timeout': 28800,
    });
  });

  it('reject -> HTTP 401 with only a diagnostic Reply-Message (scenarios 3 and 5)', () => {
    expect(toRlmRestReply(decideNetworkAccess({ ...BASE, attendancePct: 92, feeOverdue: true }))).toEqual({
      status: 401,
      body: { 'Reply-Message': 'fee_overdue' },
    });
    expect(toRlmRestReply(decideNetworkAccess({ ...BASE, lockedUntil: '2026-09-06T01:00:00.000Z' }))).toEqual({
      status: 401,
      body: { 'Reply-Message': 'locked_out' },
    });
  });

  it('senior_learner 100% -> 86400s (scenario 4)', () => {
    const reply = toRlmRestReply(
      decideNetworkAccess({ ...BASE, identity: { ...BASE.identity, role: 'senior_learner' }, attendancePct: 100 }),
    );
    expect(reply.status).toBe(200);
    expect(reply.body['Mikrotik-Rate-Limit']).toBe('25M/50M');
    expect(reply.body['Mikrotik-Group']).toBe('tier_a_senior_learner');
    expect(reply.body['Session-Timeout']).toBe(86400);
  });

  it('warden (persistent) -> no Session-Timeout key', () => {
    const reply = toRlmRestReply(
      decideNetworkAccess({ ...BASE, identity: { ...BASE.identity, role: 'warden' }, attendancePct: null }),
    );
    expect(reply.status).toBe(200);
    expect(Object.keys(reply.body)).toEqual(['Mikrotik-Rate-Limit', 'Mikrotik-Group']);
  });

  it('emergency_open -> 200 with only Session-Timeout 3600 (no rate limit, no group)', () => {
    expect(toRlmRestReply(decideNetworkAccess({ ...BASE, emergencyOpen: true }))).toEqual({
      status: 200,
      body: { 'Session-Timeout': 3600 },
    });
  });

  it('unknown_user (resolved upstream) -> 401', () => {
    expect(toRlmRestReply({ accept: false, reason: 'unknown_user' })).toEqual({
      status: 401,
      body: { 'Reply-Message': 'unknown_user' },
    });
  });

  it('config_error -> 401 with the fixed enum value (route lane alerts on it)', () => {
    expect(toRlmRestReply(decideNetworkAccess({ ...BASE, maxDevicesForRole: 0 }))).toEqual({
      status: 401,
      body: { 'Reply-Message': 'config_error' },
    });
  });

  it('device_cap -> 401', () => {
    expect(toRlmRestReply(decideNetworkAccess({ ...BASE, activeDeviceCount: 3 }))).toEqual({
      status: 401,
      body: { 'Reply-Message': 'device_cap' },
    });
  });
});
