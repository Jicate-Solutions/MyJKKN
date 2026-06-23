'use client';

/**
 * CycleHeader — the orientation strip at the top of the Social Loop page.
 *
 * Shows which account is being read, a one-line explainer of what "the loop"
 * is, the current cycle number (= how many cycles have been closed so far,
 * playbook.length), and a compact view of the 5-step loop:
 *
 *   PICK → BUILD → CHECK → SHOW → READ → DECIDE  ⟲ (back to PICK)
 *
 * When the account is not readable (engagement reads 0 for business-discovery
 * handles), an amber alert surfaces the data-layer's notReadableMessage so the
 * reader understands why the real-signal numbers below may be empty.
 */

import { Repeat, AtSign, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

const LOOP_STEPS = ['PICK', 'BUILD', 'CHECK', 'SHOW', 'READ', 'DECIDE'] as const;

export function CycleHeader({
  username,
  cycleNo,
  cycleLengthDays,
  readable,
  notReadableMessage,
}: {
  username: string;
  /** Number of completed cycles so far (playbook.length). */
  cycleNo: number;
  cycleLengthDays?: number;
  readable: boolean;
  notReadableMessage?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AtSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm font-medium">{username}</span>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The loop is a weekly habit: pick a post, build it, check it, show it,
            then <span className="font-medium text-foreground">read what the
            audience actually rewarded</span> and decide the one change for next
            week. Real signal — saves, shares, comments — is the score; likes are
            vanity.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          Cycle {cycleNo + 1}
          {cycleLengthDays ? ` · ${cycleLengthDays}-day` : ''}
        </Badge>
      </div>

      {/* Compact 5-step loop with the feedback arrow back to PICK */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
        {LOOP_STEPS.map((step, i) => (
          <span key={step} className="flex items-center gap-1.5">
            <span
              className={
                step === 'READ' || step === 'DECIDE'
                  ? 'rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary'
                  : 'rounded bg-background px-1.5 py-0.5 font-medium text-muted-foreground'
              }
            >
              {step}
            </span>
            {i < LOOP_STEPS.length - 1 && (
              <span className="text-muted-foreground">→</span>
            )}
          </span>
        ))}
        <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
          <Repeat className="h-3.5 w-3.5" />
          <span>back to PICK</span>
        </span>
      </div>

      {!readable && (
        <Alert className="border-l-4 border-l-amber-500">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {notReadableMessage ??
              'Engagement reads 0 for this handle (business-discovery accounts don’t report saves / shares / comments), so the real-signal numbers below may be empty. The loop still works — close cycles on what you can observe.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
