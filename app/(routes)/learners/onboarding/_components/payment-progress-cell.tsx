'use client';
/**
 * Fee cells for the Awaiting Payment tier of /learners/onboarding.
 *
 * Every learner in that tier has all four onboarding fields filled and is
 * 'reserved' — money is the only remaining blocker — so these cells answer the
 * three questions that tier actually raises: what bar was set, how far along is
 * this learner, and how much more must land before they turn Admitted.
 *
 * The distinctions these cells refuse to flatten:
 *   · "0% paid" (owes money) vs "nothing due yet" (owes nothing TODAY). The
 *     second is a learner on a normal instalment schedule whose first due date
 *     has not arrived; printing 0% next to a 30% bar would frame them as
 *     delinquent. `has_basis_due` separates the two.
 *   · "₹0 still needed" vs "amount unknown". amount_to_threshold is NULL, never
 *     0, when there is nothing due — so an em-dash is shown, not a rupee figure.
 *   · Progress toward the GATE vs share of the fee paid. The bar is scaled to
 *     the threshold (30%), not to 100%, because 28.6% of fees paid is 95% of
 *     the way to admission — and it is the second number that predicts whether
 *     a phone call is worth making.
 */

import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import {
  pointsToThreshold,
  THRESHOLD_BASIS_SHORT,
  type OnboardingPaymentProgress
} from '@/types/learner-onboarding';

/** Shared empty state — fee data was not fetched or not visible for this row. */
function NoData() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

/**
 * Progress toward the configured threshold: a bar filled to
 * `achieved / threshold`, captioned with both numbers so the reader never has
 * to guess which percentage the bar represents.
 */
export function PaymentProgressCell({ payment }: { payment?: OnboardingPaymentProgress }) {
  if (!payment) return <NoData />;

  const { achieved_pct, threshold_pct, has_basis_due, meets_threshold } = payment;

  if (!has_basis_due) {
    return (
      <div className="min-w-[130px] space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Nothing due yet</span>
        <p className="text-[10px] leading-tight text-muted-foreground">
          No instalment has reached its due date
        </p>
      </div>
    );
  }

  if (threshold_pct == null) {
    return (
      <div className="min-w-[130px]">
        <span className="text-xs font-semibold">{achieved_pct.toFixed(2)}%</span>
        <p className="text-[10px] text-muted-foreground">No threshold configured</p>
      </div>
    );
  }

  // Fill is the share of the GATE covered, capped at 100 so a learner past the
  // bar does not render an overflowing div.
  const fill = Math.min(100, (achieved_pct / threshold_pct) * 100);
  const remaining = pointsToThreshold(payment);

  const barColour = meets_threshold
    ? 'bg-green-600'
    : fill >= 75
      ? 'bg-amber-500'
      : 'bg-sky-500';

  const textColour = meets_threshold
    ? 'text-green-700 dark:text-green-400'
    : fill >= 75
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-sky-700 dark:text-sky-400';

  return (
    <div className="min-w-[130px] space-y-1">
      <div className="flex items-baseline gap-1">
        <span className={`text-xs font-semibold ${textColour}`}>
          {achieved_pct.toFixed(2)}%
        </span>
        <span className="text-[10px] text-muted-foreground">
          of {Number(threshold_pct).toFixed(0)}%
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(fill)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${achieved_pct}% paid of the ${threshold_pct}% threshold`}
      >
        <div
          className={`h-1.5 rounded-full transition-all ${barColour}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="text-[10px] leading-tight text-muted-foreground">
        {meets_threshold ? 'Threshold met' : `${remaining.toFixed(2)}% to go`}
      </p>
    </div>
  );
}

/**
 * The actionable number: rupees that must land before the promotion engine
 * flips this learner to Admitted.
 */
export function AmountToThresholdCell({ payment }: { payment?: OnboardingPaymentProgress }) {
  if (!payment) return <NoData />;

  if (payment.meets_threshold) {
    return (
      <Badge
        variant="outline"
        className="border-green-300 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300 text-[10px] font-medium"
      >
        Threshold met
      </Badge>
    );
  }

  if (payment.amount_to_threshold == null) {
    return (
      <span className="text-xs text-muted-foreground" title="No instalment has come due yet">
        —
      </span>
    );
  }

  return (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
        {formatCurrency(payment.amount_to_threshold, { showDecimals: false })}
      </div>
      <p className="text-[10px] leading-tight text-muted-foreground">
        to {payment.target_label || 'promote'}
      </p>
    </div>
  );
}

/**
 * The next instalment this learner still owes.
 *
 * Answers the question the percentage columns cannot: not "how much more", but
 * "by when". A collections call needs both, and before per-fee schedules
 * existed the bill's single due date carried it — now the date lives on a
 * tranche, and the bill only knows whichever one is next.
 *
 * A learner with NO schedule renders an em-dash, never a date. Their bill is a
 * single obligation and the Due Date on the bills page already says all there
 * is to say; inventing a "next instalment" for them would imply a schedule
 * that does not exist.
 */
export function NextInstalmentCell({ payment }: { payment?: OnboardingPaymentProgress }) {
  if (!payment) return <NoData />;

  const { next_due_date, next_due_amount, instalments_total, instalments_settled } = payment;

  if (instalments_total === 0) {
    return (
      <span className="text-xs text-muted-foreground" title="This learner's fees are not split into instalments">
        —
      </span>
    );
  }

  if (!next_due_date) {
    return (
      <Badge
        variant="outline"
        className="border-green-300 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300 text-[10px] font-medium"
      >
        Schedule complete
      </Badge>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdue = next_due_date < today;
  const due = new Date(`${next_due_date}T00:00:00`);
  const label = Number.isNaN(due.getTime())
    ? next_due_date
    : due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="min-w-[120px] space-y-0.5">
      <div
        className={`text-xs font-semibold tabular-nums ${
          overdue ? 'text-red-700 dark:text-red-400' : 'text-foreground'
        }`}
      >
        {label}
        {overdue && <span className="ml-1 font-normal">(overdue)</span>}
      </div>
      {next_due_amount != null && (
        <p className="text-[10px] leading-tight tabular-nums text-muted-foreground">
          {formatCurrency(next_due_amount, { showDecimals: false })} due
        </p>
      )}
      <p className="text-[10px] leading-tight text-muted-foreground">
        {instalments_settled} of {instalments_total} settled
      </p>
    </div>
  );
}

/**
 * One money column. `field` picks which figure; the header supplies the label.
 * Kept as a single component rather than three near-identical ones — the only
 * thing that varies is which number is read and how it is tinted.
 */
export function PaymentAmountCell({
  payment,
  field
}: {
  payment?: OnboardingPaymentProgress;
  field: 'basis_billed' | 'basis_paid' | 'basis_balance';
}) {
  if (!payment) return <NoData />;

  const tint =
    field === 'basis_paid'
      ? 'text-green-700 dark:text-green-400'
      : field === 'basis_balance'
        ? 'text-red-700 dark:text-red-400'
        : 'text-foreground';

  return (
    <div className={`text-right text-sm tabular-nums ${tint}`}>
      {formatCurrency(payment[field], { showDecimals: false })}
    </div>
  );
}

/**
 * Column-header tooltip text. Names the basis explicitly because "Fees Due" is
 * ambiguous on its own — a reader who assumes "the whole year" would think the
 * percentages are wrong when they are simply measured on a different denominator.
 */
export function basisHint(basis: OnboardingPaymentProgress['threshold_basis']): string {
  return `Measured ${THRESHOLD_BASIS_SHORT[basis]}, excluding application fees.`;
}
