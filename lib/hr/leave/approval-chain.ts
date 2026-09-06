/**
 * Leave approval chains — the shape decisions, with no database in sight.
 * Created 2026-08-31.
 *
 * Pure and synchronous on purpose, like lib/hr/payroll/validate-salary-upload.ts:
 * the same functions back the apply-time build, the approve/reject advance and
 * the editor's live preview, and a test can exercise every branch without a
 * Supabase client. Anything needing auth.uid(), user_roles or custom_roles is
 * resolved by the caller and passed in — see resolveRungsAbove()'s note.
 *
 * ONE IDEA CARRIES THE WHOLE FEATURE: a frozen chain is always "an ordered list
 * of steps, each with an approver SET and a quorum".
 *
 *   sequential -> N steps, each with its own approver set
 *   parallel   -> exactly ONE step holding every approver
 *
 * So "parallel" never reaches the frozen chain as a flag. current_step keeps
 * meaning what it always meant, fn_is_designated_leave_approver still reads
 * approval_chain -> current_step, and the advance logic needs no second
 * completion rule. Everything below follows from that.
 */

import type { LeaveApprovalStep, LeaveStepDecision } from '@/types/hr';
import type {
  LeaveApprovalFlow,
  LeaveApprovalFlowStep,
  LeaveApproverEntry,
  LeaveStepQuorum,
} from '@/types/hr-leave-types';

/** Neither a role nor a person — "any permitted approver", the seeded-flow case. */
const EMPTY_ENTRY: LeaveApproverEntry = {
  approver_role: null,
  approver_user_id: null,
  approver_name: null,
};

function entryOf(
  role: string | null | undefined,
  userId: string | null | undefined,
  name: string | null | undefined
): LeaveApproverEntry {
  return {
    approver_role: role ? role : null,
    approver_user_id: userId ? userId : null,
    approver_name: name ?? null,
  };
}

/**
 * The approvers on a step, whichever shape it is stored in.
 *
 * MIRRORS fn_leave_step_approvers() IN POSTGRES EXACTLY. Two readers of the same
 * JSONB that disagree is how a gate ends up admitting someone the UI says it
 * refused, so when one changes the other must change with it.
 *
 * A legacy step carries its single approver in top-level fields rather than in
 * `approvers`, so the fallback yields the step itself as one entry — the 23
 * live flows and 709 in-flight chains read identically through this.
 */
export function readApprovers(
  step: Pick<LeaveApprovalStep, 'approvers' | 'approver_role' | 'approver_user_id'> &
    Partial<Pick<LeaveApprovalFlowStep, 'approver_name'>>
): LeaveApproverEntry[] {
  if (Array.isArray(step.approvers) && step.approvers.length > 0) {
    return step.approvers.map((a) =>
      entryOf(a.approver_role, a.approver_user_id, a.approver_name)
    );
  }
  return [entryOf(step.approver_role, step.approver_user_id, step.approver_name)];
}

/** True when the entry names nobody — the permissive "any permitted approver" step. */
export function isUnconstrained(e: LeaveApproverEntry): boolean {
  return e.approver_role === null && e.approver_user_id === null;
}

/**
 * The rungs STRICTLY ABOVE the applicant's own.
 *
 * The applicant's rung is the HIGHEST they hold: someone who is both `staff` and
 * `hod` enters at hod, because entering at staff would route their request back
 * through their own level.
 *
 * Holding NO rung returns the whole ladder rather than nothing. 394 of 594
 * active HR staff hold none of staff/hod/principal/cao today, and giving them an
 * empty chain would silently approve leave for two thirds of the workforce.
 *
 * Postgres owns the authoritative version (hr_resolve_leave_ladder) because
 * user_roles and custom_roles are unreadable by ordinary staff — a browser-side
 * lookup returns empty for exactly the people applying. This copy exists for the
 * editor's preview and for tests; it is never the enforcement point.
 */
export function resolveRungsAbove(ladder: string[], heldRoleKeys: string[]): string[] {
  if (ladder.length === 0) return [];
  const held = new Set(heldRoleKeys);
  // 1-based, so 0 legitimately means "holds no rung at all" — same convention
  // as the SQL, which relies on WITH ORDINALITY.
  let rank = 0;
  ladder.forEach((role, i) => {
    if (held.has(role)) rank = i + 1;
  });
  return ladder.slice(rank);
}

function toChainStep(
  order: number,
  approvers: LeaveApproverEntry[],
  quorum: LeaveStepQuorum,
  escalateAfterHours: number,
  stepType?: 'review' | 'final'
): LeaveApprovalStep {
  const first = approvers[0] ?? EMPTY_ENTRY;
  return {
    // 1-BASED, matching chain_order and what every chain written before this
    // module carried. current_step is the 0-based ARRAY INDEX and is a different
    // number on purpose; they have never been the same thing.
    step_order: order,
    // The singular fields are still written. Every legacy reader — the RLS
    // helper's fallback, the inbox containment filter, any report — keeps
    // working on a one-approver step without knowing `approvers` exists.
    // 'hr_approver' is the placeholder the previous builder used for a step that
    // names no role; it matches no custom_roles row, which the database gate
    // reads as "any permitted approver".
    approver_role: first.approver_role ?? 'hr_approver',
    approver_user_id: first.approver_user_id,
    approvers,
    quorum,
    decisions: [],
    status: 'pending',
    decided_at: null,
    decided_by: null,
    comment: null,
    escalate_after_hours: escalateAfterHours,
    ...(stepType ? { step_type: stepType } : {}),
  };
}

/** Same person or same role listed twice collapses to one slot. */
function dedupe(entries: LeaveApproverEntry[]): LeaveApproverEntry[] {
  const seen = new Set<string>();
  const out: LeaveApproverEntry[] = [];
  for (const e of entries) {
    const key = `${e.approver_user_id ?? ''}|${e.approver_role ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export interface BuildChainInput {
  flow: Pick<
    LeaveApprovalFlow,
    'steps' | 'escalate_after_hours' | 'step_source' | 'run_mode' | 'fallback_approver'
  >;
  /** From hr_resolve_leave_ladder(). Ignored unless step_source='role_ladder'. */
  rungsAbove?: string[];
}

/**
 * The frozen chain for one application.
 *
 * Returns [] when there is genuinely nobody to route to — the caller raises the
 * existing "no approval flow is configured" error, which names the exact screen
 * to fix it on. Never invent an approver here; an empty chain that silently
 * self-approves is the failure this whole module is built to avoid.
 */
export function buildChain({ flow, rungsAbove = [] }: BuildChainInput): LeaveApprovalStep[] {
  const escalate = flow.escalate_after_hours ?? 48;
  const source = flow.step_source ?? 'explicit';
  const mode = flow.run_mode ?? 'sequential';

  type Draft = {
    order: number;
    approvers: LeaveApproverEntry[];
    quorum: LeaveStepQuorum;
    escalate: number;
    stepType?: 'review' | 'final';
  };

  let drafts: Draft[];

  if (source === 'role_ladder') {
    drafts = rungsAbove.map((role, i) => ({
      order: i + 1,
      approvers: [entryOf(role, null, null)],
      quorum: 'any' as const,
      escalate,
    }));
  } else {
    // Explicit steps are carried through UNFILTERED, including a step that names
    // nobody. That step means "any permitted approver" to the database gate, and
    // dropping it here would silently shorten the 23 live flows.
    drafts = [...(flow.steps ?? [])]
      .sort((a, b) => Number(a.chain_order ?? 0) - Number(b.chain_order ?? 0))
      .map((s, i) => ({
        // The flow's own chain_order is carried through verbatim, which is what
        // the previous builder wrote into step_order.
        order: Number(s.chain_order ?? i + 1),
        approvers: readApprovers(s),
        quorum: s.quorum ?? 'any',
        escalate: s.escalate_after_hours ?? escalate,
        stepType: s.step_type,
      }));
  }

  // Nobody above the applicant — the person at the top of the ladder applying
  // for their own leave. Their request is the one that most needs a named
  // approver, so it goes to the configured fallback rather than sailing through.
  if (drafts.length === 0 && flow.fallback_approver) {
    const f = flow.fallback_approver;
    if (f.approver_role || f.approver_user_id) {
      drafts = [
        {
          order: 1,
          approvers: [entryOf(f.approver_role, f.approver_user_id, f.approver_name)],
          quorum: 'any',
          escalate,
        },
      ];
    }
  }

  if (drafts.length === 0) return [];

  if (mode === 'parallel') {
    // ONE step holding everyone. The quorum comes from the first source step,
    // which is what the editor edits when parallel is selected.
    const all = dedupe(drafts.flatMap((d) => d.approvers));
    return [toChainStep(1, all, drafts[0].quorum, escalate, 'final')];
  }

  return drafts.map((d) => toChainStep(d.order, d.approvers, d.quorum, d.escalate, d.stepType));
}

/**
 * Has this step collected enough approvals to advance?
 *
 * 'any'  — one approval, which is what every chain in production means today.
 * 'all'  — every slot must be covered. Pinned slots are matched to that exact
 *          person; role slots cannot be verified here (roles are unreadable in
 *          the browser), so they are covered by any remaining DISTINCT approver.
 *          Every approval had to pass hr_trig_leave_enforce_approver to be
 *          recorded at all, so "a distinct approver the step admits" is the
 *          strongest statement this layer can honestly make.
 */
export function isQuorumMet(step: LeaveApprovalStep): boolean {
  const approvals = (step.decisions ?? []).filter((d) => d.decision === 'approved');
  if (approvals.length === 0) return false;

  const quorum = step.quorum ?? 'any';
  if (quorum === 'any') return true;

  const entries = readApprovers(step);
  const byIds = new Set(approvals.map((d) => d.by));

  const pinned = entries.filter((e) => e.approver_user_id !== null);
  for (const p of pinned) {
    if (!byIds.has(p.approver_user_id as string)) return false;
  }

  // Whoever is left has to cover the role slots, one distinct person each.
  const spent = new Set(pinned.map((p) => p.approver_user_id as string));
  const remaining = [...byIds].filter((id) => !spent.has(id)).length;
  return remaining >= entries.length - pinned.length;
}

export interface DecisionOutcome {
  step: LeaveApprovalStep;
  /** Approvals only: the step is complete and the chain may advance. */
  satisfied: boolean;
}

/**
 * Record one decision on a step.
 *
 * A rejection is NOT resolved here — it ends the whole application, which is the
 * caller's business, and it stays terminal at any step exactly as it is today.
 *
 * Re-deciding replaces that person's earlier decision rather than stacking a
 * second one, so a double-click cannot satisfy an 'all' quorum by itself.
 */
export function applyDecision(
  step: LeaveApprovalStep,
  decision: LeaveStepDecision
): DecisionOutcome {
  const decisions = [
    ...(step.decisions ?? []).filter((d) => d.by !== decision.by),
    decision,
  ];
  const next: LeaveApprovalStep = { ...step, decisions };

  if (decision.decision === 'rejected') {
    return {
      step: {
        ...next,
        status: 'rejected',
        decided_at: decision.at,
        decided_by: decision.by,
        comment: decision.comment,
      },
      satisfied: false,
    };
  }

  const satisfied = isQuorumMet(next);
  return {
    step: satisfied
      ? {
          ...next,
          status: 'approved',
          decided_at: decision.at,
          decided_by: decision.by,
          comment: decision.comment,
        }
      : next,
    satisfied,
  };
}

/** Everyone who has already approved, for "1 of 2 approved" in the UI. */
export function approvalProgress(step: LeaveApprovalStep): {
  approved: number;
  required: number;
} {
  const approved = (step.decisions ?? []).filter((d) => d.decision === 'approved').length;
  const required = (step.quorum ?? 'any') === 'all' ? readApprovers(step).length : 1;
  return { approved, required };
}
