/**
 * RADIUS authorization decision core — PURE, no I/O.
 *
 * When the campus router (MikroTik hotspot, Director decision Q2 2026-09-06)
 * asks FreeRADIUS "may this person connect?", FreeRADIUS calls MyJKKN over
 * rlm_rest and this function answers: accept or reject, which bandwidth tier,
 * how long the session may last, and which MikroTik group to apply.
 *
 * Q1 note (Director decision 2026-09-06 00:20): a learner signs in with Google
 * via MyJKKN. The RADIUS Access-Request therefore carries EITHER a one-time
 * token minted by MyJKKN after OAuth (as User-Password) OR a MAC-auth username
 * for a returning device. Resolving that credential to a profile is a LATER
 * lane; this module takes an already-resolved identity and only decides.
 * The loader in that lane maps custom_roles.role_key to a NetworkRole
 * category with roleKeyToNetworkRole() below; null = unknown_user.
 *
 * Rule order (first match wins):
 *   1. lockedUntil in future   -> reject locked_out
 *      (an unreadable lockedUntil/now when a lock exists ALSO rejects — fail closed)
 *   2. emergencyOpen           -> accept, reason emergency_open, no tier, 1 h
 *      SAFE DEFAULT (reviewer round 2, Director to confirm): the panic switch
 *      is checked AFTER the lockout so an abuse lockout survives a panic-open.
 *      It still bypasses fees, the device cap and every config check.
 *   3. feeOverdue              -> reject fee_overdue (guest role exempt)
 *   4. device cap reached      -> reject device_cap (a known device is exempt);
 *      a cap that is not a finite number >= 1, or a non-finite active count,
 *      -> reject config_error (fail closed; the route lane must alert)
 *   5. session hours for role  -> missing / negative / non-finite
 *      -> reject config_error. Exactly 0 = persistent (no Session-Timeout).
 *   6. tier by attendance      -> accept with tier, group, session timeout
 *   NOTE: with an EMPTY tiers list the decision is still accept, with no
 *   Mikrotik-Rate-Limit (router default = unlimited). The route lane that
 *   loads the policy rows must treat "no tiers configured" as a config error
 *   and alert; the pure core never blocks 6,000 people for a missing row.
 *   Bandwidth is the one thing that fails open; anything that decides
 *   ACCESS (lock, cap, session length) fails closed.
 */
import type {
  NetworkBandwidthTier,
  NetworkDecision,
  NetworkDecisionInput,
  NetworkRole,
} from '@/types/network';

const EMERGENCY_SESSION_SECONDS = 3600;
const SECONDS_PER_HOUR = 3600;

/**
 * custom_roles.role_key -> NetworkRole category. Every key below exists on
 * jicate/main (git grep 2026-09-06). Anything else (principal, hr_admin,
 * cbo, ...) is null and the route lane answers unknown_user until a policy
 * row maps it — adding a role here is a decision, not a default.
 */
const ROLE_KEY_TO_NETWORK_ROLE: Record<string, NetworkRole> = {
  student: 'learner',
  faculty: 'senior_learner',
  staff: 'team_member',
  hod: 'team_member',
  admin: 'admin',
  administrator: 'admin',
  system_admin: 'admin',
  super_admin: 'admin',
  warden: 'warden',
  chief_warden: 'warden',
  gate_security: 'security',
  guest: 'guest',
};

export function roleKeyToNetworkRole(roleKey: string | null | undefined): NetworkRole | null {
  if (typeof roleKey !== 'string') return null;
  const key = roleKey.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_KEY_TO_NETWORK_ROLE, key)
    ? ROLE_KEY_TO_NETWORK_ROLE[key]
    : null;
}

function sortByMinDesc(tiers: NetworkBandwidthTier[]): NetworkBandwidthTier[] {
  return [...tiers].sort((a, b) => b.attendanceMinPct - a.attendanceMinPct);
}

/**
 * Picks the tier whose [min, max) range contains the percentage. Values at or
 * above the top tier's max (100%) stay in the top tier; values below the
 * lowest tier's min fall to the lowest tier. "No record" (null, NaN, infinite,
 * outside 0..100) means: learners get the lowest tier, every other role gets
 * the top tier. A percentage that falls in a GAP between configured tiers
 * (e.g. [95,100] + [75,85] with nothing covering 85-95) is also treated as
 * "no record" — the policy rows are inconsistent, and the person must not be
 * silently read as a poor attender; the route lane should alert on gaps.
 */
export function selectTier(
  tiers: NetworkBandwidthTier[],
  attendancePct: number | null,
  role: NetworkRole,
): NetworkBandwidthTier | undefined {
  if (tiers.length === 0) return undefined;
  const ordered = sortByMinDesc(tiers);
  const top = ordered[0];
  const bottom = ordered[ordered.length - 1];
  const noRecord = role === 'learner' ? bottom : top;

  if (
    attendancePct === null ||
    !Number.isFinite(attendancePct) ||
    attendancePct < 0 ||
    attendancePct > 100
  ) {
    return noRecord;
  }

  const inRange = ordered.find(
    (t) => attendancePct >= t.attendanceMinPct && attendancePct < t.attendanceMaxPct,
  );
  if (inRange) return inRange;
  if (attendancePct >= top.attendanceMaxPct) return top;
  if (attendancePct < bottom.attendanceMinPct) return bottom;
  return noRecord; // gap between tiers
}

/**
 * Seconds for the role's session, undefined for persistent (exactly 0), or
 * null when the value is missing / negative / non-finite (config_error).
 */
function sessionTimeoutFor(
  sessionHoursByRole: Record<string, number>,
  role: NetworkRole,
): number | undefined | null {
  const hours = Object.prototype.hasOwnProperty.call(sessionHoursByRole, role)
    ? sessionHoursByRole[role]
    : undefined;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) return null;
  if (hours === 0) return undefined;
  return Math.round(hours * SECONDS_PER_HOUR);
}

export function decideNetworkAccess(input: NetworkDecisionInput): NetworkDecision {
  const { identity } = input;
  const role = identity.role;

  if (input.lockedUntil) {
    const lockedUntilMs = Date.parse(input.lockedUntil);
    const nowMs = Date.parse(input.now);
    // Fail CLOSED: a lock row exists but one of the timestamps cannot be read.
    // Accepting here would let a corrupt or malformed lock silently open the door.
    if (Number.isNaN(lockedUntilMs) || Number.isNaN(nowMs)) {
      return { accept: false, reason: 'locked_out' };
    }
    if (lockedUntilMs > nowMs) {
      return { accept: false, reason: 'locked_out' };
    }
  }

  if (input.emergencyOpen) {
    return {
      accept: true,
      reason: 'emergency_open',
      sessionTimeoutSeconds: EMERGENCY_SESSION_SECONDS,
    };
  }

  if (input.feeOverdue && role !== 'guest') {
    return { accept: false, reason: 'fee_overdue' };
  }

  const cap = input.maxDevicesForRole;
  const active = input.activeDeviceCount;
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 1) {
    return { accept: false, reason: 'config_error' };
  }
  if (typeof active !== 'number' || !Number.isFinite(active)) {
    return { accept: false, reason: 'config_error' };
  }
  if (input.isKnownDevice !== true && active >= cap) {
    return { accept: false, reason: 'device_cap' };
  }

  const timeout = sessionTimeoutFor(input.sessionHoursByRole, role);
  if (timeout === null) {
    return { accept: false, reason: 'config_error' };
  }

  const tier = selectTier(input.tiers, input.attendancePct, role);
  const decision: NetworkDecision = { accept: true };
  if (tier) {
    decision.tier = {
      code: tier.code,
      downloadMbps: tier.downloadMbps,
      uploadMbps: tier.uploadMbps,
    };
    decision.group = `${tier.code}_${role}`;
  }
  if (timeout !== undefined) decision.sessionTimeoutSeconds = timeout;
  return decision;
}
