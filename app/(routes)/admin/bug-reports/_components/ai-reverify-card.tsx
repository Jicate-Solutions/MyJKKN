'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ShieldCheck,
  Loader2,
  RefreshCw,
  CircleCheck,
  CircleAlert,
  CircleHelp,
  UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { AiReverifyVerdict, DetailedBugReport } from '@/types/bugs';

const VERDICT_META: Record<
  AiReverifyVerdict['verdict'],
  { label: string; cls: string; Icon: typeof CircleCheck }
> = {
  likely_fixed: {
    label: 'Likely fixed',
    cls: 'bg-green-50 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200',
    Icon: CircleCheck
  },
  still_broken: {
    label: 'Still broken',
    cls: 'bg-red-50 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200',
    Icon: CircleAlert
  },
  inconclusive: {
    label: 'Inconclusive',
    cls: 'bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200',
    Icon: CircleHelp
  }
};

interface AiReverifyCardProps {
  report: DetailedBugReport;
  onGenerated: () => void;
}

/**
 * Tier 2 read re-check. Re-checks the reported symptom AS THE REPORTER
 * (read-only) and shows the AI's verdict. This is a RECOMMENDATION ONLY — it
 * never resolves the bug or emails reporters; a human still decides.
 */
export function AiReverifyCard({ report, onGenerated }: AiReverifyCardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [live, setLive] = useState<AiReverifyVerdict | null>(null);

  const verdict: AiReverifyVerdict | null =
    live ?? ((report.metadata as any)?.ai_reverify as AiReverifyVerdict | undefined) ?? null;

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const response = await fetch(`/api/bug-reports/${report.id}/ai-reverify`, {
        method: 'POST'
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to re-verify');
      setLive(json.verdict as AiReverifyVerdict);
      toast.success('Re-verification complete.');
      onGenerated();
    } catch (err: any) {
      toast.error(err?.message || 'Could not re-verify this bug.');
    } finally {
      setIsRunning(false);
    }
  };

  const meta = verdict ? VERDICT_META[verdict.verdict] ?? VERDICT_META.inconclusive : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <ShieldCheck className='w-5 h-5 text-teal-500' />
            Re-verify (read-check)
          </div>
          {verdict && (
            <Button
              size='sm'
              variant='ghost'
              onClick={handleRun}
              disabled={isRunning}
              className='text-muted-foreground'
            >
              {isRunning ? (
                <Loader2 className='w-4 h-4 mr-1 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4 mr-1' />
              )}
              Re-run
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!verdict ? (
          <div className='flex flex-col items-start gap-3'>
            <p className='text-sm text-muted-foreground'>
              Re-check this bug from the reporter&apos;s own point of view
              (read-only) — whether they still have access and whether similar
              reports are still arriving — then get an AI verdict on whether it
              looks fixed. A recommendation only; it never resolves the bug or
              emails anyone.
            </p>
            <Button onClick={handleRun} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  Re-checking… usually 15–60 seconds
                </>
              ) : (
                <>
                  <ShieldCheck className='w-4 h-4 mr-2' />
                  Re-verify this bug
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center gap-2'>
              {meta && (
                <Badge variant='outline' className={meta.cls}>
                  <meta.Icon className='w-3.5 h-3.5 mr-1' />
                  {meta.label}
                </Badge>
              )}
              <Badge variant='outline' className='text-muted-foreground'>
                {verdict.reproducible === 'write'
                  ? 'write action — not read-verifiable'
                  : `${verdict.reproducible}-symptom`}
              </Badge>
              <span className='text-[11px] text-muted-foreground ml-auto'>
                confidence: {verdict.confidence} ·{' '}
                {new Date(verdict.generated_at).toLocaleString()}
              </span>
            </div>

            <p className='text-sm leading-relaxed'>{verdict.reasoning}</p>

            {verdict.what_would_confirm && (
              <>
                <Separator />
                <div className='flex items-start gap-2'>
                  <UserCheck className='w-4 h-4 mt-0.5 text-teal-500 shrink-0' />
                  <div>
                    <p className='text-xs font-medium text-muted-foreground mb-1'>
                      To be sure, a human should
                    </p>
                    <p className='text-sm'>{verdict.what_would_confirm}</p>
                  </div>
                </div>
              </>
            )}

            <p className='text-[11px] text-muted-foreground'>
              AI recommendation only — it never resolves the bug or emails
              reporters. Confirm before resolving.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
