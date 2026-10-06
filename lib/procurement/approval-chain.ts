// lib/procurement/approval-chain.ts
//
// Reading a request's copied approval steps (procurement_request_approvals).
// A send back ends a round; resubmitting starts a new one from step 1 — so
// "where is it now" always looks at the latest round only.

import type { ApprovalStage, RequestApproval } from '@/types/procurement';

/** The steps of the latest round, in order — of one list when `stage` is given. */
export function latestRound(all: RequestApproval[], stage?: ApprovalStage): RequestApproval[] {
  const rows = stage ? all.filter((r) => (r.stage ?? 'request') === stage) : all;
  if (!rows.length) return [];
  const round = Math.max(...rows.map((r) => r.round));
  return rows.filter((r) => r.round === round).sort((a, b) => a.step_order - b.step_order);
}

/** The step waiting for a decision now (in either list — they run one after the other), or null. */
export function currentStep(rows: RequestApproval[]): RequestApproval | null {
  return rows.find((r) => r.status === 'pending') ?? null;
}

/** "Step 2 of 3 — Principal" while waiting; '' otherwise. */
export function chainLine(rows: RequestApproval[]): string {
  const pending = rows.find((r) => r.status === 'pending');
  const steps = latestRound(rows, pending?.stage ?? 'request');
  const now = steps.find((r) => r.status === 'pending');
  return now ? `Step ${steps.indexOf(now) + 1} of ${steps.length} — ${now.label}` : '';
}

/** True when the waiting step is this person's to decide. (Super Admins may act on any step.) */
export function isMyTurn(rows: RequestApproval[], userId: string | undefined): boolean {
  if (!userId) return false;
  return currentStep(rows)?.approver_ids.includes(userId) ?? false;
}
