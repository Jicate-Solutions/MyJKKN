'use client';

/**
 * My pay changes — the outcome notice (ruling 5).
 *
 * A team member hears about a salary revision ONLY after the Director says
 * yes, through an in-app notice that links here. This page shows their own
 * approved changes: the new monthly pay and the day it starts. It never shows
 * who asked, why, or anything about a request that was not approved — those
 * are not in hr_salary_revision_outcomes at all, and its RLS returns only the
 * caller's own rows.
 *
 * Reached from the notice; not listed in the sidebar.
 *
 * 7 Oct 2026 (default taken): a raise held in two parts shows the person their
 * own target numbers here, read-only (TargetSection, no buttons).
 */

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMyPayOutcomes } from '@/hooks/hr/use-salary-revisions';
import { longDate, toAmount } from '@/lib/hr/salary-revision';
import { formatRupees } from '@/lib/hr/salary-suggestion';
import { todayIST } from '@/lib/hr/raise-effective-date';
import { TargetSection } from '../salary-revisions/_components/target-section';

export const navMeta = { label: 'My Pay Changes', icon: 'Wallet' };

export default function MyPayChangesPage() {
  const outcomes = useMyPayOutcomes();
  const today = todayIST();
  return (
    <ContentLayout title='My Pay Changes'>
      <div className='mb-5 max-w-2xl'>
        <h1 className='text-2xl font-semibold tracking-tight'>My pay changes</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Changes to your monthly pay that the Director has approved. Questions? Ask the HR office.
        </p>
      </div>
      {outcomes.isLoading && (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' /> Loading…</p>
      )}
      {outcomes.error && (
        <Alert variant='destructive'><AlertDescription>{outcomes.error.message}</AlertDescription></Alert>
      )}
      {!outcomes.isLoading && !outcomes.error && (outcomes.data ?? []).length === 0 && (
        <p className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
          No approved pay changes. <Link href='/dashboard' className='underline'>Back to the dashboard</Link>
        </p>
      )}
      <div className='max-w-2xl space-y-4'>
        {(outcomes.data ?? []).map((o) => {
          const before = toAmount(o.previous_monthly_gross);
          const after = toAmount(o.new_monthly_gross);
          const started = o.starts_on <= today;
          return (
            <Card key={o.id} data-testid='pay-outcome'>
              <CardContent className='space-y-2 p-5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant='outline' className='font-normal'>
                    {started ? `Since ${longDate(o.starts_on)}` : `From ${longDate(o.starts_on)}`}
                  </Badge>
                  {o.is_cut && <Badge variant='destructive'>Pay cut</Badge>}
                </div>
                <p className='text-lg'>
                  Your monthly pay {started ? 'is' : 'will be'}{' '}
                  <span className='font-semibold tabular-nums'>{after === null ? '—' : formatRupees(after)}</span>
                  {before !== null && (
                    <span className='text-muted-foreground'> (it was {formatRupees(before)})</span>
                  )}
                  .
                </p>
                {o.targets?.plan && <TargetSection targets={o.targets} today={today} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ContentLayout>
  );
}
