// app/(routes)/audit/care/predict/page.tsx
// Cycle-less hub for the calibration mirror. Someone landing here lost the
// cycle half of their link — say so explicitly (rule #27), never bounce them.

import { Crosshair } from 'lucide-react';
import { SectionEyebrow } from '../../_components/redesign/kit';

/**
 * navMeta — only reachable by trimming a shared mirror URL; the real entry is
 * the per-cycle link shared with the team being audited.
 */
export const navMeta = {
  invokedFrom: '/audit/care/[cycleId]',
} as const;

export default function CarrePredictHubPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Crosshair className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <SectionEyebrow>Culture audit · Calibration mirror</SectionEyebrow>
          <h1 className="text-lg font-semibold tracking-tight">
            This page needs a cycle link
          </h1>
          <p className="text-sm text-muted-foreground">
            The calibration mirror is opened per audit cycle. The full link you
            were given ends with the cycle&apos;s ID — this address is only the
            first half. Re-open the exact link that was shared with you, or ask
            whoever shared it to send it again.
          </p>
        </div>
      </div>
    </div>
  );
}
