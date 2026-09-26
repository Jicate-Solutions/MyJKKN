'use client';
/**
 * "View Progress" — one learner's fee position on the Awaiting Payment tab.
 *
 * Holds what the table no longer shows (Admission Year, Blocked At, Progress to
 * Threshold, Total Billed / Paid / Balance, Next Instalment, Need to Admit).
 * Laid out for reading at a glance: a header with who the learner is, the two
 * pipeline stages as a numbered stepper, then the money. Every verdict comes
 * from fn_onboarding_payment_progress (`blocked_reason`, `meets_threshold`,
 * `amount_to_threshold`) — nothing is re-derived here.
 */

import { Check, X, AlertTriangle, Clock, ExternalLink, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { formatCurrency } from '@/lib/utils';
import { formatAdmissionYear } from '@/lib/utils/admission-year-format';
import {
  BLOCKED_REASON_LABELS,
  STUCK_REASONS,
  THRESHOLD_BASIS_SHORT,
  pointsToThreshold,
  type OnboardingPaymentProgress,
  type OnboardingProfileRow,
  type ProgramRuleLine
} from '@/types/learner-onboarding';

type StageState = 'done' | 'blocked' | 'stuck' | 'waiting' | 'skipped';

const STATE_STYLE: Record<StageState, { icon: React.ReactNode; ring: string; label: string; text: string }> = {
  done: {
    icon: <Check className="h-4 w-4" />,
    ring: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
    label: 'Done',
    text: 'text-green-700 dark:text-green-400'
  },
  blocked: {
    icon: <X className="h-4 w-4" />,
    ring: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
    label: 'Blocked',
    text: 'text-red-700 dark:text-red-400'
  },
  stuck: {
    icon: <AlertTriangle className="h-4 w-4" />,
    ring: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    label: 'Rule met — status not updated',
    text: 'text-amber-700 dark:text-amber-400'
  },
  waiting: {
    icon: <Clock className="h-4 w-4" />,
    ring: 'bg-muted text-muted-foreground',
    label: 'Waiting',
    text: 'text-muted-foreground'
  },
  skipped: {
    icon: <Minus className="h-4 w-4" />,
    ring: 'bg-muted text-muted-foreground',
    label: 'Not required for this program',
    text: 'text-muted-foreground'
  }
};

const rs = (n: number) => formatCurrency(n, { showDecimals: false });

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Stage({
  n,
  title,
  state,
  last,
  children
}: {
  n: number;
  title: string;
  state: StageState;
  last?: boolean;
  children: React.ReactNode;
}) {
  const s = STATE_STYLE[state];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.ring}`}>
          {s.icon}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={`min-w-0 flex-1 space-y-2 ${last ? '' : 'pb-5'}`}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-semibold">
            Step {n}: {title}
          </p>
          <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function GateFeeRow({ label, bills, billed, paid }: { label: string; bills: number; billed: number; paid: number }) {
  const unpaid = bills > 0 && paid <= 0 && billed > 0;
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      {bills === 0 ? (
        <span className="text-muted-foreground">No bill raised</span>
      ) : (
        <span className={`font-medium tabular-nums ${unpaid ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
          {rs(paid)} <span className="font-normal text-muted-foreground">of {rs(billed)}</span>
          {unpaid ? ' · unpaid' : ' · paid'}
        </span>
      )}
    </div>
  );
}

function ruleLineLabel(l: ProgramRuleLine): string {
  if (l.label) return `${l.category} — ${l.label}`;
  return l.of > 1 ? `${l.category} — instalment ${l.seq} of ${l.of}` : l.category;
}

/** The program's own fee-structure rule for reaching Admitted. */
function ProgramRuleBlock({ p }: { p: OnboardingPaymentProgress }) {
  const lines = p.rule_lines.filter((l) => l.target === 'admitted');
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This program&apos;s fee structure sets no payment rule for Admitted.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const remaining = Math.max(0, l.amount - l.paid);
        return (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{ruleLineLabel(l)}</p>
              <p className="text-xs text-muted-foreground">Due {formatDate(l.due_date)}</p>
            </div>
            <div className="text-right">
              <p className="tabular-nums">
                <span className={l.settled ? 'font-semibold text-green-700 dark:text-green-400' : 'font-semibold'}>
                  {rs(l.paid)}
                </span>{' '}
                <span className="text-muted-foreground">of {rs(l.amount)}</span>
              </p>
              <p className={`text-xs ${l.settled ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {l.settled ? 'Paid in full' : `${rs(remaining)} to go`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThresholdStage({ p }: { p: OnboardingPaymentProgress }) {
  const thr = p.threshold_pct;
  const basis = THRESHOLD_BASIS_SHORT[p.threshold_basis];

  if (!p.has_basis_due) {
    return (
      <p className="text-sm text-muted-foreground">
        {p.threshold_basis === 'billed_to_date' ? 'No bill has been raised yet.' : 'No instalment has reached its due date yet.'}
      </p>
    );
  }

  const fill = thr ? Math.min(100, (p.achieved_pct / thr) * 100) : 0;
  const bar = p.meets_threshold ? 'bg-green-600' : fill >= 75 ? 'bg-amber-500' : 'bg-sky-500';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="text-lg font-bold tabular-nums">{p.achieved_pct.toFixed(2)}%</span>{' '}
          <span className="text-muted-foreground">
            paid of {thr != null ? `${Number(thr).toFixed(0)}%` : 'the threshold'} needed
          </span>
        </p>
        {!p.meets_threshold && thr != null && (
          <span className="text-sm text-muted-foreground">{pointsToThreshold(p).toFixed(2)}% to go</span>
        )}
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted">
        <div className={`h-2.5 rounded-full transition-all ${bar}`} style={{ width: `${fill}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Measured {basis}, excluding the application fee.</p>
    </div>
  );
}

function Stat({ label, value, tint, sub }: { label: string; value: string; tint?: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tint ?? ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function PaymentProgressDialog({
  learner,
  open,
  onOpenChange,
  canViewBills
}: {
  learner: OnboardingProfileRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canViewBills: boolean;
}) {
  const p = learner.payment;
  const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
  const institution = (learner as any).institution?.name as string | undefined;
  const program = (learner as any).program?.program_name as string | undefined;
  const admissionYear = formatAdmissionYear(learner as any) || '—';

  const isAccount = learner.lifecycle_status === 'account';
  const reason = p?.blocked_reason ?? 'none';
  const stuck = STUCK_REASONS.includes(reason);

  const noGate = !!p && !p.gate_in_program;
  const gateState: StageState = !isAccount
    ? 'done'
    : noGate
      ? 'skipped'
      : reason === 'gate_met_stuck'
      ? 'stuck'
      : reason === 'threshold_met_stuck'
        ? 'waiting'
        : 'blocked';
  const thresholdState: StageState =
    reason === 'threshold_met_stuck' ? 'stuck' : isAccount && !noGate ? 'waiting' : 'blocked';

  // The engine admits on WHICHEVER path is met first, so the number that
  // matters is the smaller of the two remaining amounts.
  const paths = [
    p?.rule_to_admit != null ? { via: 'program fee-structure rule', amount: p.rule_to_admit } : null,
    p?.amount_to_threshold != null
      ? { via: `${p.threshold_pct ?? '—'}% of total fees`, amount: p.amount_to_threshold }
      : null
  ].filter((x): x is { via: string; amount: number } => x != null);
  const nearest = paths.sort((a, b) => a.amount - b.amount)[0];

  const narrowBasis = !!p && p.threshold_basis !== 'billed_to_date';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent has no height cap of its own. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
            {name}
            <LifecycleStatusBadge status={learner.lifecycle_status} />
          </DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Roll No: </span>
                <span className="text-foreground">{learner.roll_number || '—'}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Admission Year: </span>
                <span className="text-foreground">{admissionYear}</span>
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Institution: </span>
                <span className="text-foreground">{institution || '—'}</span>
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Program: </span>
                <span className="text-foreground">{program || '—'}</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {!p ? (
          <p className="text-sm text-muted-foreground">Fee details are not available for this learner.</p>
        ) : (
          <div className="space-y-6">
            {/* Where the learner is stuck */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Why this learner is not moving</h3>
                <Badge
                  variant="outline"
                  className={`text-sm ${
                    stuck
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
                      : reason === 'gate_no_bills' || reason === 'gate_unpaid'
                        ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                        : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300'
                  }`}
                >
                  {BLOCKED_REASON_LABELS[reason]}
                </Badge>
              </div>

              <div className="rounded-lg border p-4">
                <Stage n={1} title="Account → Reserved" state={gateState}>
                  {noGate ? (
                    <p className="text-sm text-muted-foreground">
                      This program&apos;s fee structure has no Application / University fee, so
                      the learner moves straight from Account to Admitted.
                    </p>
                  ) : isAccount && reason === 'gate_no_bills' ? (
                    <p className="text-sm text-red-700 dark:text-red-400">
                      No Application / University fee bills have been raised, so this step cannot
                      complete automatically.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <GateFeeRow label="Application Fee" bills={p.app_bills} billed={p.app_billed} paid={p.app_paid} />
                      <GateFeeRow label="University Fee" bills={p.uni_bills} billed={p.uni_billed} paid={p.uni_paid} />
                    </div>
                  )}
                </Stage>
                <Stage
                  n={2}
                  title={`${noGate && isAccount ? 'Account' : 'Reserved'} → ${p.target_label || 'Admitted'}`}
                  state={thresholdState}
                  last
                >
                  <p className="text-xs text-muted-foreground">
                    Promoted as soon as EITHER of these is met:
                  </p>
                  <div className="space-y-4 rounded-md bg-muted/30 p-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">A. Program rule (fee structure)</p>
                      <ProgramRuleBlock p={p} />
                    </div>
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">B. Overall {p.threshold_pct ?? '—'}% of total fees</p>
                      <ThresholdStage p={p} />
                    </div>
                  </div>
                </Stage>
              </div>
            </section>

            {/* Money */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold">Fees</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Total Billed"
                  value={rs(p.total_billed)}
                  sub={narrowBasis ? `Due so far ${rs(p.basis_billed)}` : 'All bills except application fee'}
                />
                <Stat
                  label="Paid"
                  value={rs(p.total_paid)}
                  tint="text-green-700 dark:text-green-400"
                  sub={narrowBasis ? `Against due ${rs(p.basis_paid)}` : undefined}
                />
                <Stat
                  label="Balance"
                  value={rs(p.total_balance)}
                  tint="text-red-700 dark:text-red-400"
                  sub={narrowBasis ? `Due so far ${rs(p.basis_balance)}` : undefined}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat
                  label={`Need to reach ${p.target_label || 'Admitted'}`}
                  value={
                    reason === 'threshold_met_stuck'
                      ? 'Rule met'
                      : nearest
                        ? rs(nearest.amount)
                        : '—'
                  }
                  tint={reason === 'threshold_met_stuck' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}
                  sub={
                    reason === 'threshold_met_stuck'
                      ? 'Re-evaluate the status from the Actions menu'
                      : nearest
                        ? `Quickest route: ${nearest.via}`
                        : 'Nothing counted yet'
                  }
                />
                <Stat
                  label="Next Instalment"
                  value={p.instalments_total === 0 ? 'Not split' : p.next_due_date ? formatDate(p.next_due_date) : 'All settled'}
                  sub={
                    p.instalments_total === 0
                      ? 'Fees are not split into instalments'
                      : `${p.next_due_amount != null ? `${rs(p.next_due_amount)} due · ` : ''}${p.instalments_settled} of ${p.instalments_total} settled`
                  }
                />
              </div>
            </section>
          </div>
        )}

        {canViewBills && (
          <div className="flex justify-end border-t pt-4">
            <Button variant="outline" asChild>
              <a href={`/billing/schedule/students/${learner.id}`} target="_blank" rel="noopener noreferrer">
                View Bills
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
