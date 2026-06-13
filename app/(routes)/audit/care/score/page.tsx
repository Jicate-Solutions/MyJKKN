// app/(routes)/audit/care/score/page.tsx
// Token-less hub for the participant scoring route. Someone landing here lost
// the token half of their invite link — say so explicitly (rule #27), never
// bounce them silently.

import Link from 'next/link';

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
      <div className="max-w-md rounded-lg border p-6 space-y-3">
        <h1 className="text-base font-semibold">This page needs an invite link</h1>
        <p className="text-sm text-muted-foreground">
          CARE audit scoring opens through a personal invite link that ends in a
          long code (<span className="font-mono text-xs">/audit/care/score/&lt;token&gt;</span>).
          The link you used is missing that code — ask the initiative owner to
          copy the full scoring link from their CARE audit page and share it again.
        </p>
        <Link
          href="/dashboard"
          className="inline-block text-xs underline underline-offset-2"
        >
          ← Back to your dashboard
        </Link>
      </div>
    </div>
  );
}
