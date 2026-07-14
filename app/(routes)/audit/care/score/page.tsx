// app/(routes)/audit/care/score/page.tsx
// Token-less hub for the participant scoring route. Someone landing here lost
// the token half of their invite link — say so explicitly (rule #27), never
// bounce them silently.

import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { SectionEyebrow } from '../../_components/redesign/kit';

/**
 * navMeta — only reachable by trimming an invite URL; the real entry is the
 * tokenized link generated on /audit/care/[cycleId].
 */
export const navMeta = {
  invokedFrom: '/audit/care/[cycleId]',
} as const;

export default function CareScoreHubPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Link2 className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <SectionEyebrow>Culture audit · Second scorer</SectionEyebrow>
          <h1 className="text-lg font-semibold tracking-tight">
            This page needs an invite link
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          CARE audit scoring opens through a personal invite link that ends in a
          long code (
          <span className="font-mono text-xs">/audit/care/score/&lt;token&gt;</span>
          ). The link you used is missing that code — ask the initiative owner to
          copy the full scoring link from their CARE audit page and share it again.
        </p>
        <Link
          href="/dashboard"
          className="inline-block text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
        >
          ← Back to your dashboard
        </Link>
      </div>
    </div>
  );
}
