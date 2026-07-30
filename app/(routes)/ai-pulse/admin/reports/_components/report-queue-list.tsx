'use client';

// app/(routes)/ai-pulse/admin/reports/_components/report-queue-list.tsx
// ============================================================================
// The champion's decision surface for reported prompts (moderation #3).
//
// One row per build awaiting a human decision, with exactly two actions:
//   HIDE  -> fn_ai_pulse_disqualify_prompt_build  (removes it from the feed)
//   KEEP  -> fn_ai_pulse_clear_prompt_build_reports (clears the flags)
// Both are confirmed in an in-app Dialog — never a browser confirm()/alert().
//
// The prompt STAYS VISIBLE in the feed until a decision is made (Director
// decision #3 — no auto-hide), so the header says so plainly rather than
// implying the report already took it down.
// ============================================================================

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Flag, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  decisionErrorMessage,
  useChampionReportQueue,
  useDecideOnReportedBuild,
  type ChampionDecision,
  type ReportQueueRow,
} from '@/lib/services/ai-pulse/champion-report-queue-service';

function formatWhen(iso: string | null): string {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toLocaleString();
}

export function ReportQueueList() {
  const { data, isLoading, error } = useChampionReportQueue();
  const decide = useDecideOnReportedBuild();

  const [pending, setPending] = useState<{ row: ReportQueueRow; decision: ChampionDecision } | null>(
    null,
  );
  const [reason, setReason] = useState('');

  const closeDialog = (open: boolean) => {
    if (!open) {
      setPending(null);
      setReason('');
    }
  };

  const confirmDecision = async () => {
    if (!pending) return;
    try {
      await decide.mutateAsync({
        buildId: pending.row.build_id,
        decision: pending.decision,
        reason: pending.decision === 'hide' ? reason.trim() || null : null,
      });
      toast.success(
        pending.decision === 'hide'
          ? 'Hidden. It will not appear in the feed again.'
          : 'Kept. The flags on this prompt are cleared.',
      );
      closeDialog(false);
    } catch (e) {
      toast.error(decisionErrorMessage(e as Error));
    }
  };

  if (isLoading) {
    return (
      <div className='space-y-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-32 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive'>
        Could not load the review queue. Confirm you hold the{' '}
        <code className='font-mono'>aiPulse:anomaly.review</code> permission and
        reload.
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className='space-y-4'>
      <div className='rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground'>
        <strong>A champion decides, not the system.</strong> When someone reports a
        prompt in the classmates feed it is <em>not</em> taken down automatically —
        it stays visible and lands here for you to judge. Choose{' '}
        <strong>Hide</strong> to remove it from the feed permanently, or{' '}
        <strong>Keep</strong> to clear the flags and leave it up. Every prompt in
        the feed has already passed an automated appropriateness check before it
        could appear.
      </div>

      {rows.length === 0 && (
        <div className='rounded-md border border-dashed border-border bg-muted/20 p-10 text-center'>
          <Flag className='mx-auto h-8 w-8 text-muted-foreground' aria-hidden />
          <p className='mt-3 font-medium'>Nothing waiting for review</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            No reported prompts need a decision right now.
          </p>
        </div>
      )}

      {rows.map((row) => (
        <div key={row.build_id} className='rounded-md border border-border p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='destructive'>
              {row.report_count} {row.report_count === 1 ? 'report' : 'reports'}
            </Badge>
            {row.score != null && <Badge variant='outline'>Craft score {row.score}</Badge>}
            <span className='text-xs text-muted-foreground'>
              Last reported {formatWhen(row.last_reported_at)}
            </span>
          </div>

          <p className='mt-3 text-xs text-muted-foreground'>
            Written by{' '}
            <span className='font-medium text-foreground'>
              {row.author_name ?? 'name unavailable'}
            </span>
          </p>

          <pre className='mt-2 whitespace-pre-wrap break-words rounded bg-muted/50 p-3 text-sm'>
            {row.assembled_prompt}
          </pre>

          {row.report_reasons.length > 0 && (
            <div className='mt-3 text-sm'>
              <span className='text-muted-foreground'>Reasons given: </span>
              {row.report_reasons.join(' · ')}
            </div>
          )}

          <div className='mt-4 flex flex-wrap gap-2'>
            <Button
              variant='destructive'
              size='sm'
              onClick={() => setPending({ row, decision: 'hide' })}
            >
              Hide from feed
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPending({ row, decision: 'keep' })}
            >
              Keep it
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={pending !== null} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.decision === 'hide' ? 'Hide this prompt?' : 'Keep this prompt?'}
            </DialogTitle>
            <DialogDescription>
              {pending?.decision === 'hide'
                ? 'It will be removed from the classmates feed and the shared library, permanently.'
                : 'The reports on it will be cleared and it stays in the feed.'}
            </DialogDescription>
          </DialogHeader>

          {pending?.decision === 'hide' && (
            <div className='space-y-1'>
              <Label htmlFor='hide-reason' className='text-xs'>
                Reason (optional — kept for the audit trail)
              </Label>
              <Textarea
                id='hide-reason'
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder='e.g. inappropriate wording'
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => closeDialog(false)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              variant={pending?.decision === 'hide' ? 'destructive' : 'default'}
              onClick={confirmDecision}
              disabled={decide.isPending}
            >
              {decide.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {pending?.decision === 'hide' ? 'Hide it' : 'Keep it'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
