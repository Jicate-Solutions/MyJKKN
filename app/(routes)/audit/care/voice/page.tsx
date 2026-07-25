// app/(routes)/audit/care/voice/page.tsx
// Cycle-less hub for the sealed participant scoring door. Someone landing here
// lost the cycle half of their shared link — say so explicitly (rule #27),
// never bounce them silently.

import { Lock } from 'lucide-react';
import { SectionEyebrow } from '../../_components/redesign/kit';

/**
 * navMeta — only reachable by trimming a shared voice-door URL; the real entry
 * is the per-cycle link the Director shares when a cycle's participant lane is
 * deliberately opened.
 */
export const navMeta = {
  invokedFrom: '/audit/care/[cycleId]',
} as const;

export default function SealedVoiceHubPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <Lock className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <SectionEyebrow>Culture audit · Sealed participant voice</SectionEyebrow>
          <h1 className="text-lg font-semibold tracking-tight">
            This page needs a cycle link
          </h1>
          <p className="text-sm text-muted-foreground">
            Sealed scoring is opened deliberately, cycle by cycle. The full link
            you were given ends with the cycle&apos;s ID — this address is only
            the first half. Re-open the exact link that was shared with you, or
            ask whoever shared it to send it again.
          </p>
        </div>
      </div>
    </div>
  );
}
