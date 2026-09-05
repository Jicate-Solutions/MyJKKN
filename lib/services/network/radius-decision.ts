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
 *
 * Rule order (first match wins):
 *   1. emergencyOpen           -> accept, reason emergency_open, no tier, 1 h
 *   2. lockedUntil in future   -> reject locked_out
 *      (an unreadable lockedUntil/now when a lock exists ALSO rejects — fail closed)
 *   NOTE: with an EMPTY tiers list the decision is still accept, with no
 *   Mikrotik-Rate-Limit (router default = unlimited). The route lane that
 *   loads the policy rows must treat "no tiers configured" as a config error
 *   and alert; the pure core never blocks 6,000 people for a missing row.
 *   3. feeOverdue              -> reject fee_overdue (guest role exempt)
 *   4. device cap reached      -> reject device_cap
 *   5. tier by attendance      -> accept with tier, group, session timeout
 */
import type {
  NetworkBandwidthTier,
  NetworkDecision,
  NetworkDecisionInput,
  NetworkRole,
} from '@/types/network';

const EMERGENCY_SESSION_SECONDS = 3600;
const SECONDS_PER_HOUR = 3600;

function sortByMinDesc(tiers: NetworkBandwidthTier[]): NetworkBandwidthTier[] {
  return [...tiers].sort((a, b) => b.attendanceMinPct - a.attendanceMinPct);
}

/**
 * Picks the tier whose [min, max) range contains the percentage. Values at or
 * above the top tier's max (100%) stay in the top tier; values below the
 * lowest tier's min fall to the lowest tier. Null attendance means "no record":
 * learners get the lowest tier, every other role gets the top tier.
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

  // "No usable record": null, NaN, infinite, or outside 0..100 (a bad upstream
  // number must not be read as a real percentage).
  if (
    attendancePct === null ||
    !Number.isFinite(attendancePct) ||
    attendancePct < 0 ||
    attendancePct > 100
  ) {
    return role === 'learner' ? bottom : top;
  }

  const inRange = ordered.find(
    (t) => attendancePct >= t.attendanceMinPct && attendancePct < t.attendanceMaxPct,
  );
  if (inRange) return inRange;
  if (attendancePct >= top.attendanceMaxPct) return top;
  return bottom;
}

function sessionTimeoutFor(
  sessionHoursByRole: Record<string, number>,
  role: NetworkRole,
): number | undefined {
  const hours = sessionHoursByRole[role];
  if (hours === undefined || hours === null || hours <= 0) return undefined;
  return Math.round(hours * SECONDS_PER_HOUR);
}

export function decideNetworkAccess(input: NetworkDecisionInput): NetworkDecision {
  const { identity } = input;
  const role = identity.role;

  if (input.emergencyOpen) {
    return {
      accept: true,
      reason: 'emergency_open',
      sessionTimeoutSeconds: EMERGENCY_SESSION_SECONDS,
    };
  }

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

  if (input.feeOverdue && role !== 'guest') {
    return { accept: false, reason: 'fee_overdue' };
  }

  if (input.activeDeviceCount >= input.maxDevicesForRole) {
    return { accept: false, reason: 'device_cap' };
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
  const timeout = sessionTimeoutFor(input.sessionHoursByRole, role);
  if (timeout !== undefined) decision.sessionTimeoutSeconds = timeout;
  return decision;
}
