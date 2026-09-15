// lib/services/reservation/approval-chain.ts
// Pure, UI-independent helpers for the reservation approval chain.
//
// BUG-004008: the approvals queue offered a live Approve button to a level-2
// approver while level 1 had not acted, so the click always failed with the
// database error "Approval at level N is still pending; you cannot approve at
// level M yet". These helpers let the UI answer "is it my turn?" BEFORE the
// click, mirroring the gate in
// supabase/migrations/20260619150000_fix_reservation_approval_sequential_level_drift.sql
// (approve_reservation): the lowest pending level is derived from the LIVE
// approval_config — an approver counts as pending until they have an
// 'approved' row — and a caller whose config level is greater than that lowest
// pending level is blocked.

import type { ApprovalConfiguration } from '@/types/resource-management';

/** The subset of a `resource_approvals` row this module needs. */
export interface ApprovalRecordLike {
  approver_user_id: string;
  approval_level?: number | null;
  status: string;
}

export type ApprovalTurnState =
  | 'can_approve'
  | 'waiting_for_level'
  | 'already_acted'
  | 'not_an_approver';

export interface ApprovalTurn {
  state: ApprovalTurnState;
  /** Convenience flag: true only when `state === 'can_approve'`. */
  can_approve: boolean;
  /** The caller's level in the live config, or null when they are not in it. */
  my_level: number | null;
  /** For `waiting_for_level`: the lower level that must act first. */
  waiting_for_level: number | null;
}

interface EvaluateApprovalTurnParams {
  /** The resource's `approval_config` JSONB. */
  approvalConfig?: ApprovalConfiguration | null;
  /** Existing `resource_approvals` rows for this reservation. */
  approvals?: ApprovalRecordLike[] | null;
  /** The current user's profile id. */
  userId?: string | null;
  /** Super admins may act even when they are not part of the chain. */
  isSuperAdmin?: boolean;
}

function levelOf(entry: { level?: number | null }): number {
  const level = Number(entry?.level);
  return Number.isFinite(level) ? level : 0;
}

/**
 * Decide whether `userId` may approve/reject this reservation right now.
 * Pure — no I/O, no React. Mirrors approve_reservation()'s sequential gate.
 */
export function evaluateApprovalTurn({
  approvalConfig,
  approvals,
  userId,
  isSuperAdmin = false
}: EvaluateApprovalTurnParams): ApprovalTurn {
  const approvers = approvalConfig?.approvers ?? [];
  const rows = approvals ?? [];

  const blocked = (
    state: ApprovalTurnState,
    my_level: number | null = null,
    waiting_for_level: number | null = null
  ): ApprovalTurn => ({ state, can_approve: false, my_level, waiting_for_level });

  if (!userId) return blocked('not_an_approver');

  const myRow = rows.find((row) => row.approver_user_id === userId) ?? null;
  if (myRow && (myRow.status === 'approved' || myRow.status === 'rejected')) {
    return blocked('already_acted');
  }

  const myEntry = approvers.find((a) => !!a.user_id && a.user_id === userId) ?? null;

  if (!myEntry) {
    // The database lets a super admin outside the chain finish a reservation;
    // anyone else gets "You are not authorized to approve this reservation".
    return isSuperAdmin
      ? { state: 'can_approve', can_approve: true, my_level: null, waiting_for_level: null }
      : blocked('not_an_approver');
  }

  const myLevel = levelOf(myEntry);

  // `approval_type` defaults to 'sequential' in the database function; the gate
  // applies only to sequential chains. Note a super admin who IS in the chain
  // is still gated there, so they are gated here too.
  const approvalType = approvalConfig?.approval_type ?? 'sequential';

  if (approvalType === 'sequential') {
    const approvedUserIds = new Set(
      rows.filter((row) => row.status === 'approved').map((row) => row.approver_user_id)
    );

    const pendingLevels = approvers
      .filter((a) => !(a.user_id && approvedUserIds.has(a.user_id)))
      .map(levelOf);

    const lowestPending = pendingLevels.length ? Math.min(...pendingLevels) : null;

    if (lowestPending !== null && myLevel > lowestPending) {
      return blocked('waiting_for_level', myLevel, lowestPending);
    }
  }

  return { state: 'can_approve', can_approve: true, my_level: myLevel, waiting_for_level: null };
}

/**
 * The exact message shape raised by approve_reservation()'s sequential gate,
 * e.g. "Approval at level 1 is still pending; you cannot approve at level 2 yet".
 */
const SEQUENTIAL_BLOCK_MESSAGE = /level\s+\d+\s+is still pending/i;

/**
 * True when an approve failure is only "not your turn yet" — raised by
 * approve_reservation() as ERRCODE P0001. The approval dialog already reports
 * this inline in calm amber, so the mutation must not also fire a red
 * "Approval Failed" toast. Every other failure (including other P0001 errors)
 * returns false and keeps its toast.
 */
export function isSequentialApprovalBlockError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof message !== 'string') return false;
  // Postgres raises this with ERRCODE P0001; tolerate a wrapper that dropped
  // the code, but never a different code (those are real failures).
  if (code != null && code !== 'P0001') return false;
  return SEQUENTIAL_BLOCK_MESSAGE.test(message);
}

/** The blocking level named in a sequential-gate error message, if present. */
export function parseBlockingLevel(message: string | undefined | null): number | null {
  if (!message) return null;
  const match = message.match(/level\s+(\d+)\s+is still pending/i);
  return match ? Number(match[1]) : null;
}
