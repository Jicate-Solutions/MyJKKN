'use client';

// app/(routes)/ai-pulse/admin/reports/_components/safety-review-list.tsx
// ============================================================================
// The champion's second look at prompts the AI rejected (moderation #8).
//
// One row per build the automated checker refused, with one action:
//   RELEASE -> fn_ai_pulse_release_prompt_build_safety  (failed -> passed)
// Confirmed in an in-app AlertDialog — never a browser confirm()/alert().
//
// The checker is deliberately built to refuse whenever it is UNSURE, because a
// young audience uses this platform, so over-blocking is the intended failure
// direction. That makes its reasons a MACHINE OPINION, not a finding — and this
// screen labels them that way. The very first verdict it produced was wrong.
// ============================================================================

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, Loader2, ShieldCheck } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  releaseErrorMessage,
  useChampionSafetyQueue,
  useReleasePromptBuildSafety,
  type SafetyQueueRow,
} from '@/lib/services/ai-pulse/champion-report-queue-service';

function formatWhen(iso: string | null): string {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toLocaleString();
}

export function SafetyReviewList() {
  const { data, isLoading, error } = useChampionSafetyQueue();
  const release = useReleasePromptBuildSafety();

  const [pending, setPending] = useState<SafetyQueueRow | null>(null);

  const closeDialog = (open: boolean) => {
    if (!open) setPending(null);
  };

  const confirmRelease = async () => {
    if (!pending) return;
    try {
      await release.mutateAsync({ buildId: pending.build_id });
      toast.success('Released. It can now appear in the classmates feed.');
      closeDialog(false);
    } catch (e) {
      toast.error(releaseErrorMessage(e as Error));
    }
  };

  if (isLoading) {
    return (
      <div className='space-y-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-36 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive'>
        Could not load the AI-rejected prompts. Confirm you hold the{' '}
        <code className='font-mono'>aiPulse:anomaly.review</code> permission and reload.
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className='space-y-4'>
      <div className='rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground'>
        <strong>The automatic checker refused these — you decide if it was right.</strong>{' '}
        Before a prompt can reach the classmates feed, an automated check reads it
        and judges whether it suits a young audience. That check is built to
        refuse whenever it is unsure, so it will sometimes block ordinary learning
        work. Read the prompt yourself. If it is fine, choose{' '}
        <strong>Release to the feed</strong>. Nothing is deleted either way, and
        the checker&apos;s own reasoning is kept on the record.
      </div>

      {rows.length === 0 && (
        <div className='rounded-md border border-dashed border-border bg-muted/20 p-10 text-center'>
          <ShieldCheck className='mx-auto h-8 w-8 text-muted-foreground' aria-hidden />
          <p className='mt-3 font-medium'>No prompts are waiting for a second look</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            The automatic check has not refused anything that still needs a decision.
          </p>
        </div>
      )}

      {rows.map((row) => (
        <div key={row.build_id} className='rounded-md border border-border p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='destructive'>Refused by the automatic check</Badge>
            {row.score != null && <Badge variant='outline'>Craft score {row.score}</Badge>}
            <span className='text-xs text-muted-foreground'>
              Checked {formatWhen(row.safety_checked_at)}
            </span>
          </div>

          <p className='mt-3 text-xs text-muted-foreground'>
            Written by{' '}
            <span className='font-medium text-foreground'>
              {row.author_name ?? 'name unavailable'}
            </span>{' '}
            · submitted {formatWhen(row.created_at)}
          </p>

          <pre className='mt-2 whitespace-pre-wrap break-words rounded bg-muted/50 p-3 text-sm'>
            {row.assembled_prompt}
          </pre>

          {row.safety_reasons.length > 0 && (
            <div className='mt-3 rounded-md border border-dashed border-border bg-background p-3'>
              <p className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <Bot className='h-3.5 w-3.5' aria-hidden />
                What the automatic checker said — its wording, not a finding of fact
              </p>
              <ul className='mt-2 list-disc space-y-1 pl-5 text-sm italic text-muted-foreground'>
                {row.safety_reasons.map((reason, i) => (
                  <li key={i}>&ldquo;{reason}&rdquo;</li>
                ))}
              </ul>
            </div>
          )}

          <div className='mt-4 flex flex-wrap gap-2'>
            <Button variant='default' size='sm' onClick={() => setPending(row)}>
              Release to the feed
            </Button>
          </div>
        </div>
      ))}

      <AlertDialog open={pending !== null} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release this prompt to the feed?</AlertDialogTitle>
            <AlertDialogDescription>
              You are overruling the automatic check. This prompt becomes eligible
              for the classmates feed, where other learners can see it. The
              checker&apos;s original reasons stay on the record, along with your
              name and the time you released it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={release.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open until the RPC answers, so a failure can be
                // surfaced instead of the row silently appearing to succeed.
                e.preventDefault();
                void confirmRelease();
              }}
              disabled={release.isPending}
            >
              {release.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Release it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
