'use client';

/**
 * "Suggested salary" box at the top of the Propose Package dialog.
 *
 * The figure is worked out on the SERVER from the college's pay band for the
 * candidate's official job title plus half the Director's department amount
 * for each year before JKKN (lib/hr/candidate-salary-suggestion.ts). This file
 * only shows the result; the band and the rule never reach the browser.
 *
 * "Use this figure" fills the Monthly Salary box and nothing else. Nothing is
 * saved until the person presses Propose Package.
 *
 * People without `hr.payroll.salary.view` see one plain line and no figure,
 * and nothing is fetched for them.
 */

import Link from 'next/link';
import { AlertTriangle, Info, Loader2, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCandidateSalarySuggestion } from '@/hooks/hr/use-candidate-salary-suggestion';
import { formatRupees } from '@/lib/hr/salary-suggestion';

interface Props {
  candidateId: string;
  /** Holds hr.payroll.salary.view (or is a super admin). */
  canSeeSalary: boolean;
  /** Super admins get links to the settings pages that fix a missing input. */
  isSuperAdmin: boolean;
  /** Fills the Monthly Salary box. Saves nothing. */
  onUseFigure: (figure: number) => void;
}

export function CandidateSalarySuggestionBox({ candidateId, canSeeSalary, isSuperAdmin, onUseFigure }: Props) {
  const { data, isLoading, isFetching, error } = useCandidateSalarySuggestion(candidateId, {
    enabled: canSeeSalary,
  });

  if (!canSeeSalary) {
    return (
      <p className='flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground' data-testid='suggestion-no-access'>
        <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
        A suggested salary is shown only to people who can see salaries.
      </p>
    );
  }

  const working = isLoading || isFetching;
  const s = working || error ? null : (data?.suggestion ?? null);

  return (
    <div className='space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 dark:bg-primary/10' data-testid='candidate-salary-suggestion'>
      <p className='flex items-center gap-2 text-sm font-medium'>
        <Sparkles className='h-4 w-4 text-primary' />
        Suggested salary
      </p>

      {working && (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />
          Working it out…
        </p>
      )}

      {!working && error && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {s && s.verdict === 'cannot_suggest' && (
        <div className='space-y-2' data-testid='suggestion-missing'>
          <p className='text-sm'>No figure can be suggested yet. What is missing:</p>
          <ul className='space-y-2'>
            {s.reasons.map((r) => (
              <li
                key={r.code}
                className='rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
              >
                <p>{r.text}</p>
                {r.fix && <p className='mt-0.5 text-amber-800 dark:text-amber-200'>{r.fix.text}</p>}
                {r.fix?.href && isSuperAdmin && (
                  <Link href={r.fix.href} className='mt-0.5 inline-block font-medium underline'>
                    {r.fix.linkLabel ?? 'Open settings'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s && s.verdict === 'suggested' && s.suggested !== null && (
        <div className='space-y-2'>
          <div className='flex flex-wrap items-end justify-between gap-2'>
            <div>
              <p className='text-xs text-muted-foreground'>Suggested monthly salary</p>
              <p className='text-2xl font-semibold tabular-nums' data-testid='suggested-figure'>
                {formatRupees(s.suggested)}
              </p>
            </div>
            <Button type='button' size='sm' variant='secondary' onClick={() => onUseFigure(s.suggested as number)}>
              Use this figure
            </Button>
          </div>

          {s.aboveBandBy !== null && (
            <Alert variant='destructive' data-testid='above-band'>
              <AlertTriangle className='h-4 w-4' />
              <AlertTitle>Above band by {formatRupees(s.aboveBandBy)}</AlertTitle>
              <AlertDescription>It is not capped. Check before proposing it.</AlertDescription>
            </Alert>
          )}

          <ul className='divide-y rounded-md border bg-background text-xs'>
            {s.lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className='flex items-start justify-between gap-3 px-2.5 py-1.5'>
                <div className='min-w-0'>
                  <p className='font-medium'>{line.label}</p>
                  <p className='text-muted-foreground'>{line.note}</p>
                </div>
                <span className='shrink-0 tabular-nums'>
                  {line.amount === null ? (
                    <span className='text-muted-foreground'>—</span>
                  ) : line.amount < 0 ? (
                    formatRupees(line.amount)
                  ) : (
                    `+ ${formatRupees(line.amount)}`
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className='text-xs text-muted-foreground'>
            A suggestion only. Nothing is saved until you press Propose Package.
          </p>
        </div>
      )}
    </div>
  );
}
