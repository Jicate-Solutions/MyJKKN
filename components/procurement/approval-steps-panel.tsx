'use client';

/**
 * A request's category approval steps, latest round: who signed and when, whose
 * turn it is, who comes next. Earlier rounds (before a send back) fold under
 * "Earlier". Renders nothing for a request without a category chain.
 */

import { Check, CircleDashed, Clock, CornerUpLeft, SkipForward, X } from 'lucide-react';
import { latestRound } from '@/lib/procurement/approval-chain';
import { formatDateDMY } from '@/lib/utils/date-format';
import { cn } from '@/lib/utils';
import type { RequestApproval } from '@/types/procurement';

const when = (iso: string | null) =>
  iso ? `${formatDateDMY(iso)} ${new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '';

function StepLine({ s, names }: { s: RequestApproval; names: Record<string, string> }) {
  const who = s.acted_by_profile?.full_name ?? '';
  const waitingFor = s.approver_ids.map((id) => names[id]).filter(Boolean).join(' / ');
  const icon =
    s.status === 'approved' ? <Check className="h-4 w-4 text-green-600" />
    : s.status === 'pending' ? <Clock className="h-4 w-4 text-amber-600" />
    : s.status === 'returned' ? <CornerUpLeft className="h-4 w-4 text-amber-600" />
    : s.status === 'rejected' ? <X className="h-4 w-4 text-destructive" />
    : s.status === 'skipped' ? <SkipForward className="h-4 w-4 text-muted-foreground" />
    : <CircleDashed className="h-4 w-4 text-muted-foreground" />;
  const text =
    s.status === 'approved' ? `${who}${s.on_behalf ? ' (Super Admin, on behalf)' : ''} · ${when(s.acted_at)}`
    : s.status === 'pending' ? `Waiting${waitingFor ? ` for ${waitingFor}` : ''}`
    : s.status === 'returned' ? `Sent back by ${who} · ${when(s.acted_at)}`
    : s.status === 'rejected' ? `Rejected by ${who} · ${when(s.acted_at)}`
    : s.status === 'skipped' ? 'Skipped — the requester is this approver'
    : s.status === 'cancelled' ? 'Not reached'
    : 'Next';
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className={cn('text-sm', s.status === 'pending' ? 'font-semibold' : 'font-medium')}>{s.label}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
        {s.remarks && s.status !== 'skipped' && <p className="mt-0.5 text-xs italic text-muted-foreground">“{s.remarks}”</p>}
      </div>
    </li>
  );
}

export function ApprovalStepsPanel({
  approvals,
  approverNames,
}: {
  approvals: RequestApproval[];
  /** profile id → name, for "Waiting for …". */
  approverNames: Record<string, string>;
}) {
  if (!approvals.length) return null;
  const groups = (['request', 'final'] as const)
    .map((stage) => {
      const steps = latestRound(approvals, stage);
      const round = steps[0]?.round ?? 1;
      const earlier = approvals.filter((a) => (a.stage ?? 'request') === stage && a.round < round);
      return { stage, steps, round, earlier };
    })
    .filter((g) => g.steps.length > 0);
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.stage}>
          <h2 className="mb-3 text-base font-semibold">{g.stage === 'final' ? 'Final approval' : 'Request approval'}</h2>
          <ol className="space-y-3">
            {g.steps.map((s) => (
              <StepLine key={s.id} s={s} names={approverNames} />
            ))}
          </ol>
          {g.earlier.length > 0 && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Earlier ({g.round - 1} round{g.round - 1 === 1 ? '' : 's'} before it was sent back)
              </summary>
              <ol className="mt-2 space-y-2">
                {g.earlier.map((s) => (
                  <StepLine key={s.id} s={s} names={approverNames} />
                ))}
              </ol>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
