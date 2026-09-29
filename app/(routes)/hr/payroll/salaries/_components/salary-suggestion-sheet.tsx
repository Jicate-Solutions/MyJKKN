'use client';

/**
 * "Suggest a revised salary" — the panel behind the Suggest action on Employee
 * Salaries (the Director, 29 Sep 2026).
 *
 * A SUGGESTION ONLY. Under his ruling of 18 September 2026 the band is
 * reference material and a raise is his separate decision, so nothing on this
 * panel saves anything. "Use this figure" only opens the existing Edit Salary
 * dialog with the monthly gross filled in and Effective from set to the 1st of
 * next month (India time) — an approved raise starts on the 1st of the month
 * after approval (29 Sep 2026) and is never backdated (18 Sep 2026); the
 * dialog refuses a past date in that flow. The HR head still reviews it and
 * presses Save there.
 *
 * NEVER A STALE FIGURE. While the panel re-asks the server (every re-opening
 * does, see useSalarySuggestion), the previous answer is hidden and "Use this
 * figure" is disabled. If that re-ask FAILS, React Query keeps the previous
 * answer in `data`; the panel shows only the error and no "Use this figure" at
 * all. Either way a figure worked out under an older rule cannot be carried
 * into the dialog.
 *
 * The figure is worked out on the server (GET /api/hr/payroll/salary-suggestions)
 * from the college's pay band and the Director's rule. Every step is a line
 * here, so the figure is never a number without a reason. When the rule has
 * not been set there is no figure at all — the panel says so and, for a super
 * admin, links to the rule editor.
 */

import Link from 'next/link';
import { AlertTriangle, Info, Loader2, Settings2, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useSalarySuggestion } from '@/hooks/hr/use-salary-suggestion';
import { formatRupees, type SalarySuggestion } from '@/lib/hr/salary-suggestion';
import { firstOfNextMonthIST, formatLongDate } from '@/lib/hr/raise-effective-date';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

export const SALARY_SUGGESTION_RULE_EDITOR = '/hr/admin/policies/salary-suggestion';

function bandText(s: SalarySuggestion): string {
  if (s.bandMin === null || s.bandMax === null) return 'No band';
  return s.bandMin === s.bandMax
    ? formatRupees(s.bandMin)
    : `${formatRupees(s.bandMin)} to ${formatRupees(s.bandMax)}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border bg-muted/40 p-2.5'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-sm font-medium tabular-nums'>{value}</p>
    </div>
  );
}

interface Props {
  row: StaffSalaryDirectoryRow | null;
  onOpenChange: (open: boolean) => void;
  /** Holds hr.payroll.salary.manage — may open the Edit Salary dialog. */
  canManage: boolean;
  /** May open the rule editor, which is super-admin only. */
  canEditRule: boolean;
  /** Opens the Edit Salary dialog for this person with the figure filled in. Saves nothing. */
  onUseFigure: (row: StaffSalaryDirectoryRow, monthlyGross: number) => void;
}

export function SalarySuggestionSheet({ row, onOpenChange, canManage, canEditRule, onUseFigure }: Props) {
  const { data, isLoading, isFetching, error } = useSalarySuggestion(row?.staff_uuid ?? null, {
    enabled: Boolean(row),
  });
  // While the server is being asked again, or when the last ask failed, the
  // previous answer is NOT shown: it may have been worked out under a rule that
  // has since changed. (After a failed re-fetch React Query still holds the old
  // `data`, with `error` set and `isFetching` false.)
  const working = isLoading || isFetching;
  const failed = Boolean(error) && !working;
  const s = working || failed ? null : (data?.suggestion ?? null);
  // Whether the last answer offered a figure — keeps the footer in place, with
  // its button disabled, while a re-fetch is running. After a failed ask there
  // is no footer at all: only the error.
  const offered =
    !failed && data?.suggestion.verdict === 'suggested' && data.suggestion.suggested !== null;

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2'>
            <Sparkles className='h-4 w-4 text-primary' />
            Suggested salary
          </SheetTitle>
          <SheetDescription>
            {`${row?.person_name ?? ''} — worked out from the pay band and the Director's rule.`}
          </SheetDescription>
          <div className='flex flex-wrap gap-1.5 pt-1'>
            <Badge variant='outline' className='font-normal'>
              {row?.role_title ?? 'No job title'}
            </Badge>
            <Badge variant='outline' className='font-normal'>{row?.works_at_name ?? ''}</Badge>
          </div>
        </SheetHeader>

        <p className='mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground'>
          <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          A suggestion only. Nobody&apos;s pay changes here; a raise is the Director&apos;s decision.
        </p>

        <div className='mt-4 space-y-4'>
          {working && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground' data-testid='suggestion-working'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Working it out…
            </div>
          )}

          {failed && error && (
            <Alert variant='destructive'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {s && (
            <>
              {s.verdict === 'rule_not_set' && (
                <Alert data-testid='rule-not-set'>
                  <Settings2 className='h-4 w-4' />
                  <AlertTitle>The suggestion rule is not set yet</AlertTitle>
                  <AlertDescription>
                    <p>
                      The Director decides how much a year at JKKN, a year of earlier experience
                      and other things are worth. Until he sets that, no figure is suggested.
                    </p>
                    {canEditRule ? (
                      <Link
                        href={SALARY_SUGGESTION_RULE_EDITOR}
                        className='mt-1 inline-block font-medium underline'
                      >
                        Set the rule
                      </Link>
                    ) : (
                      <p className='mt-1'>Only a super admin can set it.</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {s.verdict === 'suggested' && s.suggested !== null && (
                <div className='rounded-lg border border-primary/40 bg-primary/5 p-4'>
                  <p className='text-xs text-muted-foreground'>Suggested monthly gross</p>
                  <p className='text-3xl font-semibold tabular-nums' data-testid='suggested-figure'>
                    {formatRupees(s.suggested)}
                  </p>
                  {s.currentMonthlyPay !== null && (
                    <p className='mt-1 text-xs text-muted-foreground tabular-nums'>
                      Up from {formatRupees(s.currentMonthlyPay)} (
                      {formatRupees(s.suggested - s.currentMonthlyPay)} more)
                    </p>
                  )}
                </div>
              )}

              {(s.verdict === 'no_band' || s.verdict === 'cannot_suggest') && (
                <Alert
                  className='border-amber-500/50 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400'
                  data-testid='no-suggestion'
                >
                  <AlertTriangle className='h-4 w-4' />
                  <AlertTitle>No figure suggested</AlertTitle>
                  <AlertDescription>
                    {s.reasons
                      .filter((r) => r.code !== 'extras_need_approval')
                      .map((r) => (
                        <p key={r.code}>{r.text}</p>
                      ))}
                  </AlertDescription>
                </Alert>
              )}

              <div className='grid grid-cols-2 gap-2'>
                <Fact
                  label='Current pay'
                  value={
                    s.currentMonthlyPay === null
                      ? 'Not recorded'
                      : `${formatRupees(s.currentMonthlyPay)} a month`
                  }
                />
                <Fact label='Pay band for this job title' value={bandText(s)} />
                {data?.ruleSource && (
                  <Fact
                    label='Rule used'
                    value={data.ruleSource === 'college' ? "This college's own" : 'Group-wide'}
                  />
                )}
              </div>

              {s.verdict === 'rule_not_set' &&
                s.reasons
                  .filter((r) => r.code !== 'rule_not_set')
                  .map((r) => (
                    <p key={r.code} className='text-xs text-muted-foreground'>
                      {r.text}
                    </p>
                  ))}

              {s.lines.length > 0 && (
                <div className='rounded-lg border'>
                  <p className='border-b px-3 py-2 text-xs font-medium text-muted-foreground'>
                    How it is worked out
                  </p>
                  <ul className='divide-y'>
                    {s.lines.map((line, i) => (
                      <li key={`${line.label}-${i}`} className='flex items-start justify-between gap-3 px-3 py-2'>
                        <div className='min-w-0'>
                          <p className='text-sm font-medium'>{line.label}</p>
                          <p className='text-xs text-muted-foreground'>{line.note}</p>
                        </div>
                        <span className='shrink-0 text-sm tabular-nums'>
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
                  {s.computed !== null && (
                    <div className='flex items-center justify-between border-t bg-muted/40 px-3 py-2'>
                      <span className='text-sm font-medium'>Worked-out figure</span>
                      <span className='text-sm font-semibold tabular-nums'>
                        {formatRupees(s.computed)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {s.extrasEligible.length > 0 && (
                <div
                  className='rounded-lg border border-amber-500/50 bg-amber-500/5 p-3'
                  data-testid='extras-eligible'
                >
                  <p className='text-sm font-medium'>Eligible — needs the Director&apos;s approval</p>
                  <ul className='mt-1 space-y-0.5 text-sm'>
                    {s.extrasEligible.map((e) => (
                      <li key={e.label} className='flex justify-between gap-3 tabular-nums'>
                        <span>{e.label}</span>
                        <span>{formatRupees(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Not included in the figure. He approves each case himself.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {offered && row && (
          <SheetFooter className='mt-6 flex-col gap-2 sm:flex-col sm:space-x-0'>
            {canManage ? (
              <>
                <Button
                  disabled={s === null}
                  onClick={() => {
                    if (s?.verdict === 'suggested' && s.suggested !== null) onUseFigure(row, s.suggested);
                  }}
                >
                  Use this figure
                </Button>
                <p className='text-xs text-muted-foreground'>
                  {s?.suggested != null
                    ? `Opens Update salary with ${formatRupees(s.suggested)} filled in, starting on ${formatLongDate(firstOfNextMonthIST())}. `
                    : 'Opens Update salary with the suggested figure filled in, starting on the 1st of next month. '}
                  A raise starts on the 1st of the month after it is approved; a date in the past
                  is refused there. Nothing is saved until you press Save.
                </p>
              </>
            ) : (
              <p className='text-xs text-muted-foreground'>
                You can see salaries here but not record them.
              </p>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
