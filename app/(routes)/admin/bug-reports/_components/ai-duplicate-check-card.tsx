'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CopyCheck, Loader2, RefreshCw, Search, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AiDuplicateCheck, DetailedBugReport } from '@/types/bugs';

const VERDICT_STYLES: Record<AiDuplicateCheck['verdict'], string> = {
  duplicate:
    'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200',
  related:
    'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200',
  distinct:
    'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200'
};

const VERDICT_LABEL: Record<AiDuplicateCheck['verdict'], string> = {
  duplicate: 'looks like a duplicate',
  related: 'related, but a different defect',
  distinct: 'looks like its own issue'
};

interface AiDuplicateCheckCardProps {
  report: DetailedBugReport;
  /** Refetch the report after a check lands (metadata changed server-side). */
  onChecked: () => void;
  /** Opens the existing Mark-as-Duplicate dialog — the human action. */
  onMarkDuplicate?: () => void;
}

/**
 * Meaning-level duplicate check for one report, on the ₹0 Max lane.
 *
 * Why this exists: the grouping engine (fn_bug_cluster_scan) is pure string
 * overlap with a 0.45 floor, so two reports of ONE defect written in different
 * words never group. The live case that prompted this scored 0.332. Here the
 * string match only builds a shortlist and the AI makes the call.
 *
 * SUGGESTION ONLY — nothing is marked automatically. The admin decides.
 */
export function AiDuplicateCheckCard({
  report,
  onChecked,
  onMarkDuplicate
}: AiDuplicateCheckCardProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [liveCheck, setLiveCheck] = useState<AiDuplicateCheck | null>(null);

  const check: AiDuplicateCheck | null =
    liveCheck ??
    ((report.metadata as any)?.ai_duplicate_check as AiDuplicateCheck | undefined) ??
    null;

  // metadata is untyped JSONB read back from the DB — a row written by an older
  // shape (or a partial write) must not crash the whole admin page on .length.
  const alsoConsider = Array.isArray(check?.also_consider)
    ? check!.also_consider
    : [];

  const handleCheck = async () => {
    setIsChecking(true);
    try {
      const response = await fetch(
        `/api/bug-reports/${report.id}/duplicate-check`,
        { method: 'POST' }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Failed to run the duplicate check');
      }
      setLiveCheck(json.check as AiDuplicateCheck);
      toast.success('Duplicate check done.');
      onChecked();
    } catch (err: any) {
      toast.error(err?.message || 'Could not run the duplicate check.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <CopyCheck className='w-5 h-5 text-purple-500' />
            Duplicate Check
          </div>
          {check && (
            <Button
              size='sm'
              variant='ghost'
              onClick={handleCheck}
              disabled={isChecking}
              className='text-muted-foreground'
            >
              {isChecking ? (
                <Loader2 className='w-4 h-4 mr-1 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4 mr-1' />
              )}
              Re-check
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!check ? (
          <div className='flex flex-col items-start gap-3'>
            <p className='text-sm text-muted-foreground'>
              Check whether another open report already describes this same
              problem — compared by meaning, so it still matches when the two
              reporters used completely different words. Runs on the internal AI
              lane at no API cost.
            </p>
            <Button onClick={handleCheck} disabled={isChecking}>
              {isChecking ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  Checking… usually 15–60 seconds
                </>
              ) : (
                <>
                  <Search className='w-4 h-4 mr-2' />
                  Check for Duplicates
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant='outline'
                className={VERDICT_STYLES[check.verdict] ?? VERDICT_STYLES.distinct}
              >
                {VERDICT_LABEL[check.verdict] ?? check.verdict}
              </Badge>
              <span className='text-[11px] text-muted-foreground ml-auto'>
                confidence: {check.confidence} · compared against{' '}
                {check.candidates_considered} open report
                {check.candidates_considered === 1 ? '' : 's'} ·{' '}
                {new Date(check.generated_at).toLocaleString()}
              </span>
            </div>

            {check.reasoning && (
              <p className='text-sm leading-relaxed'>{check.reasoning}</p>
            )}

            {check.canonical_display_id && (
              <>
                <Separator />
                <div className='space-y-2'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Most likely the same as
                  </p>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Link
                      href={`/admin/bug-reports/${check.canonical_bug_id}`}
                      className='font-mono text-sm font-semibold underline underline-offset-2'
                    >
                      {check.canonical_display_id}
                    </Link>
                    {check.canonical_in_cluster && (
                      <Badge variant='outline' className='text-[11px]'>
                        <Layers className='mr-1 h-3 w-3' />
                        already in a group
                      </Badge>
                    )}
                  </div>
                  {onMarkDuplicate && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={onMarkDuplicate}
                      className='mt-1'
                    >
                      Review and mark as duplicate…
                    </Button>
                  )}
                </div>
              </>
            )}

            {check.downgraded && (
              <p className='text-[11px] text-amber-700 dark:text-amber-400'>
                The AI named a report that was not in the comparison list, so this
                was downgraded from &ldquo;duplicate&rdquo; to
                &ldquo;related&rdquo; rather than link somewhere unverified.
              </p>
            )}

            {alsoConsider.length > 0 && (
              <div>
                <p className='text-xs font-medium text-muted-foreground mb-1'>
                  Also worth a look
                </p>
                <ul className='space-y-1 text-sm'>
                  {alsoConsider.map((a) => (
                    <li key={a.bug_id} className='flex flex-wrap gap-2'>
                      <Link
                        href={`/admin/bug-reports/${a.bug_id}`}
                        className='font-mono text-xs font-semibold underline underline-offset-2'
                      >
                        {a.display_id}
                      </Link>
                      <span className='text-muted-foreground text-xs'>
                        {a.relation}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className='text-[11px] text-muted-foreground'>
              Suggestion only — nothing has been marked or closed. Confirm before
              acting on it.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
