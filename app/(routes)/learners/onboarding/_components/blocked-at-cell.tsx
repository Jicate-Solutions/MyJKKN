'use client';
/**
 * "Blocked At" — where in the fee pipeline a learner is stuck, and why.
 *
 *   ① Account → Reserved   every Application / University fee bill carries a payment
 *   ② Reserved → Admitted  paid% ≥ threshold on the configured basis
 *
 * Both stages are always drawn, in order, so the reader sees the whole road and
 * not just the current pothole. The verdict (`blocked_reason`) comes from
 * fn_onboarding_payment_progress, next to the engine's own predicates — this
 * cell only renders it, it never re-derives it.
 */

import { Check, X, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import {
  BLOCKED_REASON_LABELS,
  STUCK_REASONS,
  type OnboardingPaymentProgress
} from '@/types/learner-onboarding';

type StageState = 'done' | 'blocked' | 'stuck' | 'waiting';

const STATE_ICON: Record<StageState, React.ReactNode> = {
  done: <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,
  blocked: <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />,
  stuck: <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
  waiting: <Clock className="h-3.5 w-3.5 text-muted-foreground" />
};

const rs = (n: number) => formatCurrency(n, { showDecimals: false });

function Stage({
  n,
  title,
  state,
  children
}: {
  n: string;
  title: string;
  state: StageState;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-1.5">
      <span className="mt-0.5 shrink-0">{STATE_ICON[state]}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] font-medium leading-tight">
          {n} {title}
        </p>
        <div className="text-[10px] leading-tight text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** "0 / 500" for one gate fee, red when that fee has no payment at all. */
function GateFee({ label, bills, billed, paid }: { label: string; bills: number; billed: number; paid: number }) {
  if (bills === 0) return <span>{label}: no bill</span>;
  const unpaid = paid <= 0 && billed > 0;
  return (
    <span className={unpaid ? 'font-medium text-red-700 dark:text-red-400' : undefined}>
      {label} {rs(paid)} / {rs(billed)}
    </span>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BlockedAtCell({ payment }: { payment?: OnboardingPaymentProgress }) {
  if (!payment) return <span className="text-xs text-muted-foreground">—</span>;

  const {
    lifecycle_status,
    blocked_reason,
    app_bills,
    app_billed,
    app_paid,
    uni_bills,
    uni_billed,
    uni_paid,
    achieved_pct,
    threshold_pct,
    amount_to_threshold,
    pct_billed_to_date,
    next_due_date,
    target_label
  } = payment;

  const isAccount = lifecycle_status === 'account';
  const stuck = STUCK_REASONS.includes(blocked_reason);

  // ── Stage ① ────────────────────────────────────────────────────────────
  const gateState: StageState = !isAccount
    ? 'done'
    : blocked_reason === 'gate_met_stuck'
      ? 'stuck'
      : blocked_reason === 'threshold_met_stuck'
        ? 'waiting'
        : 'blocked';

  const gateDetail =
    blocked_reason === 'gate_no_bills' ? (
      <span className="font-medium text-red-700 dark:text-red-400">
        No Application / University fee bills raised — cannot auto-reserve
      </span>
    ) : app_bills + uni_bills === 0 ? (
      <span>No gate fees billed</span>
    ) : (
      <span className="flex flex-wrap gap-x-2">
        <GateFee label="App" bills={app_bills} billed={app_billed} paid={app_paid} />
        <GateFee label="Univ" bills={uni_bills} billed={uni_billed} paid={uni_paid} />
      </span>
    );

  // ── Stage ② ────────────────────────────────────────────────────────────
  const stage2State: StageState =
    blocked_reason === 'threshold_met_stuck'
      ? 'stuck'
      : isAccount
        ? 'waiting'
        : 'blocked';

  const nextDue = formatDate(next_due_date);
  const thr = threshold_pct != null ? `${Number(threshold_pct).toFixed(0)}%` : 'threshold';

  let stage2Detail: React.ReactNode;
  if (blocked_reason === 'threshold_met_stuck') {
    stage2Detail = (
      <span className="font-medium text-amber-700 dark:text-amber-400">
        {achieved_pct.toFixed(1)}% paid — threshold met, status not updated
      </span>
    );
  } else if (amount_to_threshold == null) {
    stage2Detail = (
      <span>
        Nothing due yet
        {pct_billed_to_date > 0 && ` · ${pct_billed_to_date.toFixed(1)}% of total bill paid in advance`}
        {nextDue && ` · next due ${nextDue}`}
      </span>
    );
  } else {
    stage2Detail = (
      <span>
        {achieved_pct.toFixed(1)}% of {thr} due paid ·{' '}
        <span className="font-medium text-amber-700 dark:text-amber-400">{rs(amount_to_threshold)}</span> to go
      </span>
    );
  }

  return (
    <div className="w-full min-w-[300px] space-y-1.5">
      <Badge
        variant="outline"
        className={`text-[10px] font-medium ${
          stuck
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
            : blocked_reason === 'gate_no_bills' || blocked_reason === 'gate_unpaid'
              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
              : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300'
        }`}
      >
        {BLOCKED_REASON_LABELS[blocked_reason]}
      </Badge>
      <Stage n="①" title="Account → Reserved" state={gateState}>
        {gateDetail}
      </Stage>
      <Stage n="②" title={`Reserved → ${target_label || 'Admitted'}`} state={stage2State}>
        {stage2Detail}
      </Stage>
    </div>
  );
}
