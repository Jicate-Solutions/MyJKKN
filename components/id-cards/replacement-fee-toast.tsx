'use client';

// ============================================================================
// Replacement-fee prompt shared by the single-card print surfaces.
// Created: 2026-09-26.
//
// POST /api/id-cards/jobs answers 409 replacement_fee_required once a person
// has used their free card(s). Until now the client read every 409 as a queue
// collision and showed "Already in the print queue" over an EMPTY queue. This
// toast says what is really happening — replacement number and price — and
// lets the in-charge accept the charge, which re-submits with
// replacement_fee_acknowledged so the charge is recorded with the job.
// ============================================================================

import toast from 'react-hot-toast';

import type { EnqueueOutcome } from '@/lib/services/id-cards/print-jobs-client';

type ReplacementFeeOutcome = Extract<EnqueueOutcome, { status: 'replacement_fee' }>;

export function formatReplacementFee(outcome: ReplacementFeeOutcome): string {
  return `${outcome.feeCurrency} ${outcome.feeAmount}`;
}

/**
 * Show the replacement-fee prompt. `onAccept` runs the acknowledged enqueue;
 * the caller owns its own success / failure toasts.
 */
export function toastReplacementFee(
  personName: string,
  outcome: ReplacementFeeOutcome,
  onAccept: () => void | Promise<void>
): void {
  const fee = formatReplacementFee(outcome);
  toast(
    (t) => (
      <span className="flex flex-col gap-2">
        <span>{`Replacement card ${outcome.replacementNumber} for ${personName} — fee ${fee} applies.`}</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
            onClick={() => {
              toast.dismiss(t.id);
              void onAccept();
            }}
          >
            {`Print & record ${fee}`}
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => toast.dismiss(t.id)}
          >
            Not now
          </button>
        </span>
      </span>
    ),
    { duration: 12000 }
  );
}
