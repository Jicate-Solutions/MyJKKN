/**
 * Which service_requests is a user actually the approver of?
 *
 * BUG (MRS.SARANYA G, 2026-09-08): a Faculty at Engineering was offered a
 * Bonafide request she could not act on. The row was step 1 of "Bonafied
 * Certificate (Engineering)" — a `hod` step with 6 NAMED approvers, none of
 * them her. She is named on step 2 of that same type. The queue showed it to
 * all 31 active Faculty at that institution.
 *
 * The old filter built a CROSS PRODUCT:
 *
 *   service_type_id IN (every type I appear on)
 *   AND current_approval_step IN (every step_order I appear on)
 *
 * so being on (Bonafide, step 2) plus (Hall Ticket, step 1) matched
 * (Bonafide, step 1) — a pair that exists in neither row. It also matched
 * steps purely on `approver_role`, ignoring `approver_user_ids`.
 *
 * THE AUTHORITY IS canUserApprove(), which this must agree with exactly:
 *
 *   - a step whose approver_user_ids is NON-EMPTY is in multi-approver mode:
 *     only those users may approve and THE ROLE IS IGNORED;
 *   - otherwise the legacy role match applies.
 *
 * A queue that admits someone the gate refuses is not a cosmetic bug: it
 * advertises work that cannot be done, which is the same class as
 * BUG-006007 (a count above a list it did not describe).
 *
 * Pairs are kept paired. Steps are grouped BY step_order so the emitted
 * PostgREST filter stays one `and(...)` group per distinct step_order rather
 * than one per (type, step) pair — same rows, bounded string length.
 */

export interface ApprovalStepRow {
  step_order: number;
  service_type_id: string;
  approver_role: string | null;
  approver_user_ids: string[] | null;
}

/** True when the step names specific people — role is then irrelevant. */
export function isNamedApproverStep(step: ApprovalStepRow): boolean {
  return Array.isArray(step.approver_user_ids) && step.approver_user_ids.length > 0;
}

/**
 * The steps this user may actually act on, split by whether the match should be
 * confined to their own institution.
 *
 * `named` is NOT institution-scoped: naming someone is an explicit choice, and
 * a named approver may act cross-institution (mirrors the RLS named-approver
 * policies and the unscoped branch canUserApprove already allows).
 *
 * `role` IS institution-scoped: it is a broad match on a job title, so without
 * the pin every Faculty in every college would share one queue.
 */
export function splitAssignedSteps(
  steps: ApprovalStepRow[],
  userRole: string,
  userId: string
): { named: ApprovalStepRow[]; role: ApprovalStepRow[] } {
  const named: ApprovalStepRow[] = [];
  const role: ApprovalStepRow[] = [];

  for (const step of steps) {
    if (isNamedApproverStep(step)) {
      // Multi-approver mode. Only the listed users, never the role — this is
      // the rule canUserApprove enforces, and the half the old queue dropped.
      if (step.approver_user_ids!.includes(userId)) named.push(step);
      continue;
    }
    if (step.approver_role === userRole) role.push(step);
  }

  return { named, role };
}

/** One `and(...)` group per step_order, listing only that step's own types. */
function groupsFor(steps: ApprovalStepRow[], institutionId?: string): string[] {
  const typesByStep = new Map<number, Set<string>>();
  for (const s of steps) {
    if (!typesByStep.has(s.step_order)) typesByStep.set(s.step_order, new Set());
    typesByStep.get(s.step_order)!.add(s.service_type_id);
  }

  return [...typesByStep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stepOrder, typeIds]) => {
      const parts = [
        `service_type_id.in.(${[...typeIds].sort().join(',')})`,
        `current_approval_step.eq.${stepOrder}`,
      ];
      if (institutionId) parts.push(`institution_id.eq.${institutionId}`);
      return `and(${parts.join(',')})`;
    });
}

/**
 * The PostgREST `.or()` body selecting this user's approval queue, or null when
 * they are the approver of nothing — callers must treat null as "empty queue",
 * never as "no filter", or the query would return every open request.
 */
export function buildApproverScopeFilter(
  steps: ApprovalStepRow[],
  userRole: string,
  userId: string,
  institutionId?: string
): string | null {
  const { named, role } = splitAssignedSteps(steps, userRole, userId);

  const groups = [
    ...groupsFor(named, undefined),
    ...groupsFor(role, institutionId),
  ];

  return groups.length > 0 ? groups.join(',') : null;
}
