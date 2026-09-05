// types/network.ts
//
// Campus Wi-Fi (RADIUS) authorization types. Pure data shapes shared by
// lib/services/network/radius-decision.ts (the decision core) and
// lib/services/network/radius-rest-format.ts (the FreeRADIUS rlm_rest wire
// format). No runtime code lives here.

/** Roles the network policy distinguishes. Mirrors the session-length policy keys. */
export type NetworkRole =
  | 'learner'
  | 'senior_learner'
  | 'team_member'
  | 'admin'
  | 'warden'
  | 'security'
  | 'guest';

/** An identity that has ALREADY been resolved from the RADIUS Access-Request. */
export interface NetworkIdentity {
  profileId: string;
  role: NetworkRole;
  institutionId: string;
}

/**
 * One attendance-based bandwidth tier. A percentage belongs to the tier whose
 * [attendanceMinPct, attendanceMaxPct) range contains it; the top tier also
 * owns its own upper bound so 100% lands in it.
 */
export interface NetworkBandwidthTier {
  code: string;
  attendanceMinPct: number;
  attendanceMaxPct: number;
  downloadMbps: number;
  uploadMbps: number;
}

export interface NetworkDecisionInput {
  identity: NetworkIdentity;
  /** Attendance percentage 0-100, or null when no attendance record exists. */
  attendancePct: number | null;
  feeOverdue: boolean;
  /** ISO timestamp until which the person is locked out, or null. */
  lockedUntil: string | null;
  activeDeviceCount: number;
  maxDevicesForRole: number;
  tiers: NetworkBandwidthTier[];
  /** Session length per role in hours; 0 = persistent (no Session-Timeout). */
  sessionHoursByRole: Record<string, number>;
  /** Panic switch: MyJKKN is down or the Director opened the network. */
  emergencyOpen: boolean;
  /** ISO timestamp of "now" — injected so the function stays pure. */
  now: string;
}

export type NetworkRejectReason =
  | 'fee_overdue'
  | 'locked_out'
  | 'device_cap'
  | 'unknown_user';

export type NetworkDecisionReason = NetworkRejectReason | 'emergency_open';

export interface NetworkDecisionTier {
  code: string;
  downloadMbps: number;
  uploadMbps: number;
}

export interface NetworkDecision {
  accept: boolean;
  reason?: NetworkDecisionReason;
  tier?: NetworkDecisionTier;
  /** Omitted when the role's session is persistent (hours = 0). */
  sessionTimeoutSeconds?: number;
  /** `${tier.code}_${role}` — the MikroTik user-profile group. */
  group?: string;
}

/** HTTP status + JSON body that FreeRADIUS rlm_rest turns into a RADIUS reply. */
export interface RlmRestReply {
  /** 200 = Access-Accept with the body decoded into reply attributes; 401 = Access-Reject. */
  status: 200 | 401;
  body: Record<string, string | number>;
}
