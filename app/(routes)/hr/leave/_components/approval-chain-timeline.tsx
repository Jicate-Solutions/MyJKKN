'use client';

/**
 * The frozen approval chain, every step, with who sits on it and what they did.
 *
 * WHY THIS EXISTS. The detail sheet used to print one line per step —
 * "Step 2  principal  (pending)" — which made a three-step chain read as three
 * role keys, and the only person it could ever NAME was the final approver,
 * because that is the one id the queue RPC resolves. A step is a SET of
 * approvers with a quorum (2026-08-31), and a decided step carries who decided
 * it, when, and any per-approver decisions; none of that was on screen.
 *
 * THREE SHAPES OF STEP COEXIST IN THE DATA and all three render here:
 *   - legacy single approver: the step's own approver_role / approver_user_id,
 *     decided_by + decided_at, no `approvers` and no `decisions` (62 rows today)
 *   - multi-approver: `approvers[]` + `quorum`, decisions in `decisions[]`
 *     (58 rows today)
 *   - in-flight: nothing decided yet
 *
 * A REJECTION LIVES ON THE APPLICATION, NOT THE STEP. Rejecting sets
 * hr_leave_applications.status = 'rejected' and final_approver_id, but the
 * chain step it happened on stays 'pending' (no chain row in production has a
 * 'rejected' step). So the rejected step is DERIVED: the step at current_step
 * while the application is rejected.
 *
 * Names come from chain_names, resolved server-side by the detail route —
 * profiles and custom_roles are RLS-hidden to staff. Every lookup falls back
 * to the frozen approver_name and then the raw key/id, so a missing name never
 * hides a step.
 */

import { Check, Clock, Minus, UserRound, Users, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HRLeaveApplicationDetail, LeaveApprovalStep } from '@/types/hr';

const fmtStamp = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('en-IN') : '—';

type StepState = 'approved' | 'rejected' | 'current' | 'queued' | 'skipped' | 'not_reached';

const STATE: Record<StepState, { label: string; badge: 'success' | 'destructive' | 'default' | 'outline' | 'secondary'; dot: string }> = {
  approved:    { label: 'Approved',     badge: 'success',     dot: 'bg-emerald-500' },
  rejected:    { label: 'Rejected',     badge: 'destructive', dot: 'bg-red-500' },
  current:     { label: 'Waiting here', badge: 'default',     dot: 'bg-amber-500' },
  queued:      { label: 'Queued',       badge: 'outline',     dot: 'bg-muted-foreground/30' },
  skipped:     { label: 'Skipped',      badge: 'secondary',   dot: 'bg-muted-foreground/30' },
  not_reached: { label: 'Not reached',  badge: 'outline',     dot: 'bg-muted-foreground/30' },
};

function stateOf(step: LeaveApprovalStep, idx: number, app: HRLeaveApplicationDetail): StepState {
  if (step.status === 'approved') return 'approved';
  if (step.status === 'rejected') return 'rejected';
  if (step.status === 'skipped') return 'skipped';
  const open = app.status === 'pending' || app.status === 'escalated';
  if (idx === app.current_step) {
    if (app.status === 'rejected') return 'rejected';
    if (open) return 'current';
  }
  return open ? 'queued' : 'not_reached';
}

export function ApprovalChainTimeline({ app }: { app: HRLeaveApplicationDetail }) {
  const people = app.chain_names?.people ?? {};
  const roles = app.chain_names?.roles ?? {};
  const person = (id: string | null | undefined, fallback?: string | null) =>
    (id && people[id]) || fallback || id || 'Unnamed';

  const chain = app.approval_chain ?? [];
  if (chain.length === 0) {
    return <p className="text-sm text-muted-foreground">No approval steps recorded.</p>;
  }

  return (
    <ol className="space-y-3">
      {chain.map((step, idx) => {
        const state = stateOf(step, idx, app);
        const s = STATE[state];
        const isFinal = step.step_type === 'final' || (!step.step_type && idx === chain.length - 1);

        // A legacy step IS its own single approver.
        const approvers =
          step.approvers && step.approvers.length > 0
            ? step.approvers
            : [{
                approver_role: step.approver_user_id ? null : step.approver_role,
                approver_user_id: step.approver_user_id ?? null,
                approver_name: step.approver_name ?? null,
              }];

        // Multi-approver steps record each decision; legacy ones record one on
        // the step itself. A derived rejection has neither on the chain, so it
        // is read off the application.
        const decisions =
          step.decisions && step.decisions.length > 0
            ? step.decisions
            : step.decided_by
              ? [{ by: step.decided_by, at: step.decided_at ?? '', decision: (step.status === 'rejected' ? 'rejected' : 'approved') as 'approved' | 'rejected', comment: step.comment ?? null }]
              : state === 'rejected' && app.final_approver_id
                ? [{ by: app.final_approver_id, at: app.final_decided_at ?? '', decision: 'rejected' as const, comment: app.rejection_reason ?? null }]
                : [];

        return (
          <li key={`${step.step_order}-${idx}`} className="relative pl-5">
            {/* Rail: dot on this step, line down to the next. */}
            <span className={cn('absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full', s.dot)} aria-hidden />
            {idx < chain.length - 1 && (
              <span className="absolute left-[4px] top-4 h-[calc(100%+0.25rem)] w-px bg-border" aria-hidden />
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">Step {step.step_order ?? idx + 1}</span>
              <span className="text-xs text-muted-foreground">{isFinal ? 'approves' : 'reviews'}</span>
              <Badge variant={s.badge} className="text-[10px]">{s.label}</Badge>
              {state === 'current' && step.escalate_after_hours ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> escalates after {step.escalate_after_hours}h
                </span>
              ) : null}
            </div>

            <ul className="mt-1 space-y-0.5">
              {approvers.map((a, i) => {
                const pinned = !!a.approver_user_id;
                const label = pinned
                  ? person(a.approver_user_id, a.approver_name)
                  : (a.approver_role && roles[a.approver_role]) || a.approver_name || a.approver_role || 'Any permitted approver';
                return (
                  <li key={i} className="flex items-center gap-1.5 text-sm">
                    {pinned ? (
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 truncate">{label}</span>
                    {!pinned && a.approver_role && (
                      <span className="shrink-0 text-xs text-muted-foreground">anyone holding this role</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {approvers.length > 1 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {step.quorum === 'all' ? 'All of them must approve.' : 'Any one of them clears this step.'}
              </p>
            )}

            {decisions.length > 0 && (
              <ul className="mt-1.5 space-y-1 border-l-2 border-muted pl-2">
                {decisions.map((d, i) => (
                  <li key={i} className="text-xs">
                    <span className="inline-flex items-center gap-1">
                      {d.decision === 'rejected' ? (
                        <X className="h-3 w-3 text-red-600" />
                      ) : (
                        <Check className="h-3 w-3 text-emerald-600" />
                      )}
                      <span className="font-medium">{person(d.by)}</span>
                      <span className="text-muted-foreground">
                        {d.decision === 'rejected' ? 'rejected' : 'approved'} · {fmtStamp(d.at)}
                      </span>
                    </span>
                    {d.comment && (
                      <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{d.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {state === 'current' && decisions.length === 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <Minus className="h-3 w-3" /> No decision yet
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
