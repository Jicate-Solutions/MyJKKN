'use client';
/**
 * Cohort fee position for the Awaiting Payment tier.
 *
 * Answers the question the table cannot: "what bar did I set, and how far is
 * this whole group from it?" The threshold is not hard-coded here — it is read
 * from the same admission_statuses row the promotion engine reads, so editing
 * it in Stages & Statuses moves this banner and the gate together.
 *
 * Totals cover the ENTIRE tier, not the visible page (see `paymentSummary` in
 * _data/get-onboarding-learners.ts). A banner quietly reporting page 1 would be
 * read as the cohort's, which is the kind of number that ends up in a report.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Wallet, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  THRESHOLD_BASIS_SHORT,
  type OnboardingPaymentSummary
} from '@/types/learner-onboarding';

export function PaymentThresholdBanner({ summary }: { summary?: OnboardingPaymentSummary }) {
  if (!summary || summary.learners === 0) return null;

  const { threshold_pct, threshold_basis, target_label, billed, paid, balance } = summary;

  // Cohort progress uses summed rupees, NOT the mean of per-learner percentages.
  // Averaging percentages weights a learner with a ₹35,000 bill the same as one
  // with ₹2,85,000 and would not reconcile with the rupee totals beside it.
  const achieved = billed > 0 ? (paid / billed) * 100 : 0;
  const fill = threshold_pct ? Math.min(100, (achieved / threshold_pct) * 100) : 0;

  return (
    <Card className="border-sky-200 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20">
      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* The configured gate */}
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Threshold to {target_label || 'Admitted'}
              </p>
              <p className="text-2xl font-bold leading-none text-sky-700 dark:text-sky-300">
                {threshold_pct != null ? `${Number(threshold_pct).toFixed(0)}%` : 'Not set'}
              </p>
              <p className="text-xs text-muted-foreground">
                {THRESHOLD_BASIS_SHORT[threshold_basis]}
              </p>
            </div>
          </div>

          {/* Where the cohort actually stands */}
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="w-full space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Collected so far
              </p>
              <p className="text-2xl font-bold leading-none text-emerald-700 dark:text-emerald-300">
                {achieved.toFixed(2)}%
              </p>
              <div className="h-1.5 w-full max-w-[160px] rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${fill}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(paid, { showDecimals: false })} of{' '}
                {formatCurrency(billed, { showDecimals: false })}
              </p>
            </div>
          </div>

          {/* What is still owed */}
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Balance outstanding
              </p>
              <p className="text-2xl font-bold leading-none text-red-700 dark:text-red-300">
                {formatCurrency(balance, { showDecimals: false })}
              </p>
              <p className="text-xs text-muted-foreground">
                across {summary.learners.toLocaleString()} learner
                {summary.learners === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {/* The number that actually unblocks the queue */}
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Needed to clear the gate
              </p>
              <p className="text-2xl font-bold leading-none text-amber-700 dark:text-amber-300">
                {formatCurrency(summary.amount_to_threshold, { showDecimals: false })}
              </p>
              <p className="text-xs text-muted-foreground">
                {/* A non-zero `meets_threshold` here means learners satisfy the gate
                    but were never promoted — a stuck engine, not a slow payer.
                    Surfaced rather than hidden because the 2026-08-11 outage looked
                    exactly like this and went unnoticed for months. */}
                {summary.meets_threshold > 0
                  ? `${summary.meets_threshold} already past the threshold — re-evaluate their status`
                  : summary.nothing_due > 0
                    ? `${summary.nothing_due} have no instalment due yet`
                    : 'to promote every learner here'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
