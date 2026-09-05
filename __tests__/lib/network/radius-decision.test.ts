import { describe, it, expect } from 'vitest';
import { decideNetworkAccess, selectTier } from '@/lib/services/network/radius-decision';
import type { NetworkBandwidthTier, NetworkDecisionInput, NetworkRole } from '@/types/network';

// Same four tiers the May 2026 smoke test used (vault: Smoke-Test-RADIUS-2026-05-09).
const TIERS: NetworkBandwidthTier[] = [
  { code: 'tier_a', attendanceMinPct: 95, attendanceMaxPct: 100, downloadMbps: 50, uploadMbps: 25 },
  { code: 'tier_b', attendanceMinPct: 85, attendanceMaxPct: 95, downloadMbps: 25, uploadMbps: 12 },
  { code: 'tier_c', attendanceMinPct: 75, attendanceMaxPct: 85, downloadMbps: 10, uploadMbps: 5 },
  { code: 'tier_d', attendanceMinPct: 0, attendanceMaxPct: 75, downloadMbps: 5, uploadMbps: 2 },
];

const SESSION_HOURS: Record<string, number> = {
  learner: 8,
  senior_learner: 24,
  team_member: 24,
  admin: 24,
  warden: 0,
  security: 0,
  guest: 1,
};

const NOW = '2026-09-06T00:00:00.000Z';

function input(overrides: Partial<NetworkDecisionInput> & { role?: NetworkRole } = {}): NetworkDecisionInput {
  const { role = 'learner', ...rest } = overrides;
  return {
    identity: { profileId: 'p-1', role, institutionId: 'i-1' },
    attendancePct: 97,
    feeOverdue: false,
    lockedUntil: null,
    activeDeviceCount: 0,
    maxDevicesForRole: 3,
    tiers: TIERS,
    sessionHoursByRole: SESSION_HOURS,
    emergencyOpen: false,
    now: NOW,
    ...rest,
  };
}

describe('decideNetworkAccess — the five May 2026 smoke scenarios', () => {
  it('1. learner 97%, fees paid -> tier_a 50M/25M, 8h', () => {
    expect(decideNetworkAccess(input({ attendancePct: 97 }))).toEqual({
      accept: true,
      tier: { code: 'tier_a', downloadMbps: 50, uploadMbps: 25 },
      group: 'tier_a_learner',
      sessionTimeoutSeconds: 28800,
    });
  });

  it('2. learner 78%, fees paid -> tier_c 10M/5M, 8h', () => {
    expect(decideNetworkAccess(input({ attendancePct: 78 }))).toEqual({
      accept: true,
      tier: { code: 'tier_c', downloadMbps: 10, uploadMbps: 5 },
      group: 'tier_c_learner',
      sessionTimeoutSeconds: 28800,
    });
  });

  it('3. learner 92%, fees OVERDUE -> reject fee_overdue', () => {
    expect(decideNetworkAccess(input({ attendancePct: 92, feeOverdue: true }))).toEqual({
      accept: false,
      reason: 'fee_overdue',
    });
  });

  it('4. senior_learner 100% -> tier_a, 24h', () => {
    expect(decideNetworkAccess(input({ role: 'senior_learner', attendancePct: 100 }))).toEqual({
      accept: true,
      tier: { code: 'tier_a', downloadMbps: 50, uploadMbps: 25 },
      group: 'tier_a_senior_learner',
      sessionTimeoutSeconds: 86400,
    });
  });

  it('5. locked_until in the future -> reject locked_out', () => {
    expect(
      decideNetworkAccess(input({ lockedUntil: '2026-09-06T01:00:00.000Z' })),
    ).toEqual({ accept: false, reason: 'locked_out' });
  });
});

describe('decideNetworkAccess — rule order and edge cases', () => {
  it('emergency_open wins over everything: accept, no tier, 1h', () => {
    const d = decideNetworkAccess(
      input({ emergencyOpen: true, feeOverdue: true, lockedUntil: '2099-01-01T00:00:00Z', activeDeviceCount: 9 }),
    );
    expect(d).toEqual({ accept: true, reason: 'emergency_open', sessionTimeoutSeconds: 3600 });
    expect(d.tier).toBeUndefined();
    expect(d.group).toBeUndefined();
  });

  it('locked_out is checked before fee_overdue', () => {
    const d = decideNetworkAccess(input({ feeOverdue: true, lockedUntil: '2026-09-06T00:00:01.000Z' }));
    expect(d).toEqual({ accept: false, reason: 'locked_out' });
  });

  it('an expired lock does not reject', () => {
    const d = decideNetworkAccess(input({ lockedUntil: '2026-09-05T23:59:59.000Z' }));
    expect(d.accept).toBe(true);
  });

  it('device_cap: activeDeviceCount >= maxDevicesForRole rejects', () => {
    expect(decideNetworkAccess(input({ activeDeviceCount: 3, maxDevicesForRole: 3 }))).toEqual({
      accept: false,
      reason: 'device_cap',
    });
    expect(decideNetworkAccess(input({ activeDeviceCount: 2, maxDevicesForRole: 3 })).accept).toBe(true);
  });

  it('guest role is exempt from the fee block', () => {
    const d = decideNetworkAccess(input({ role: 'guest', feeOverdue: true, attendancePct: null }));
    expect(d.accept).toBe(true);
    expect(d.sessionTimeoutSeconds).toBe(3600);
  });

  it('warden is persistent: no sessionTimeoutSeconds at all', () => {
    const d = decideNetworkAccess(input({ role: 'warden', attendancePct: null }));
    expect(d.accept).toBe(true);
    expect(d.sessionTimeoutSeconds).toBeUndefined();
    expect('sessionTimeoutSeconds' in d).toBe(false);
  });

  it('null attendance: learner -> lowest tier, senior_learner -> top tier', () => {
    expect(decideNetworkAccess(input({ attendancePct: null })).tier?.code).toBe('tier_d');
    expect(decideNetworkAccess(input({ role: 'senior_learner', attendancePct: null })).tier?.code).toBe('tier_a');
  });

  it('boundary values: 95 -> tier_a, 85 -> tier_b, 75 -> tier_c, 74.9 -> tier_d', () => {
    expect(decideNetworkAccess(input({ attendancePct: 95 })).tier?.code).toBe('tier_a');
    expect(decideNetworkAccess(input({ attendancePct: 85 })).tier?.code).toBe('tier_b');
    expect(decideNetworkAccess(input({ attendancePct: 75 })).tier?.code).toBe('tier_c');
    expect(decideNetworkAccess(input({ attendancePct: 74.9 })).tier?.code).toBe('tier_d');
  });

  it('just-below boundaries stay in the lower tier: 94.9 -> tier_b, 84.9 -> tier_c', () => {
    expect(decideNetworkAccess(input({ attendancePct: 94.9 })).tier?.code).toBe('tier_b');
    expect(decideNetworkAccess(input({ attendancePct: 84.9 })).tier?.code).toBe('tier_c');
  });

  it('fails CLOSED when a lock exists but lockedUntil is unreadable', () => {
    const d = decideNetworkAccess(input({ lockedUntil: 'not-a-date' }));
    expect(d).toEqual({ accept: false, reason: 'locked_out' });
  });

  it('fails CLOSED when a lock exists but now is unreadable', () => {
    const d = decideNetworkAccess(input({ lockedUntil: '2099-01-01T00:00:00.000Z', now: 'garbage' }));
    expect(d).toEqual({ accept: false, reason: 'locked_out' });
  });

  it('no lock + unreadable now still accepts (nothing to compare)', () => {
    const d = decideNetworkAccess(input({ lockedUntil: null, now: 'garbage' }));
    expect(d.accept).toBe(true);
  });

  it('negative, >100, NaN and Infinity attendance read as "no record"', () => {
    for (const bad of [-5, 140, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decideNetworkAccess(input({ attendancePct: bad })).tier?.code).toBe('tier_d');
      expect(
        decideNetworkAccess(input({ attendancePct: bad, role: 'senior_learner' })).tier?.code,
      ).toBe('tier_a');
    }
  });

  it('empty tiers list: accept with no tier and no group (documented fail-open on bandwidth only)', () => {
    const d = decideNetworkAccess(input({ tiers: [] }));
    expect(d.accept).toBe(true);
    expect(d.tier).toBeUndefined();
    expect(d.group).toBeUndefined();
  });

  it('does not mutate the caller\'s tier list order', () => {
    const tiers = [...TIERS].reverse();
    const before = tiers.map((t) => t.code);
    decideNetworkAccess(input({ tiers, attendancePct: 90 }));
    expect(tiers.map((t) => t.code)).toEqual(before);
  });
});

describe('selectTier', () => {
  it('returns undefined when no tiers are configured', () => {
    expect(selectTier([], 90, 'learner')).toBeUndefined();
  });

  it('clamps 0% to the lowest tier and 100% to the top tier', () => {
    expect(selectTier(TIERS, 0, 'learner')?.code).toBe('tier_d');
    expect(selectTier(TIERS, 100, 'learner')?.code).toBe('tier_a');
  });
});
