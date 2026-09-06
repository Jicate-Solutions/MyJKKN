'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, GitPullRequest, Stethoscope, CheckCircle2 } from 'lucide-react';
import { useBugClusterMembership } from '@/hooks/bug-reports/use-bug-reports';

interface BugClusterBannerProps {
  reportId: string;
}

const GROUP_STATUS_LABEL: Record<string, string> = {
  proposed: 'awaiting review',
  confirmed: 'confirmed group',
  dismissed: 'dismissed group'
};

/**
 * "This report is one of N" — the reverse bug → group lookup.
 *
 * Without this, an admin opening a single report cannot tell that the same
 * defect was already grouped, diagnosed, or even fixed, so the work gets redone.
 * At the time of writing 444 of 2,699 reports sit in a group and 183 of the 185
 * hand-marked duplicates were already grouped — i.e. the duplicate was marked by
 * hand for work the grouping engine had already done.
 *
 * Renders nothing when the report is in no group (the majority case), so it never
 * adds noise to an ordinary report.
 */
export function BugClusterBanner({ reportId }: BugClusterBannerProps) {
  const { data: groups, isLoading } = useBugClusterMembership(reportId);

  // Reserve the row height while loading — never return null mid-load, which
  // would shift every card below it once the answer lands.
  if (isLoading) {
    return <Skeleton className='h-9 w-full rounded-lg' />;
  }

  if (!groups || groups.length === 0) return null;

  return (
    <div className='space-y-2'>
      {groups.map((g) => {
        const fixed = g.verify_tally?.likely_fixed ?? 0;
        const stillBroken = g.verify_tally?.still_broken ?? 0;

        return (
          <div
            key={g.id}
            className='flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950'
          >
            <Layers className='w-5 h-5 shrink-0 text-indigo-700 dark:text-indigo-300' />

            <div className='min-w-0 text-sm text-indigo-900 dark:text-indigo-100'>
              <span className='font-semibold'>
                Part of a group of {g.member_count} similar report
                {g.member_count === 1 ? '' : 's'}
              </span>
              {g.is_seed && (
                <span className='text-indigo-700 dark:text-indigo-300'>
                  {' '}
                  — this one is the group&apos;s reference report
                </span>
              )}
              {g.root_cause && (
                <p className='mt-1 text-indigo-800 dark:text-indigo-200'>
                  <span className='font-medium'>Diagnosed cause:</span>{' '}
                  {g.root_cause}
                </p>
              )}
              {g.my_verify_verdict && (
                <p className='mt-1 text-indigo-800 dark:text-indigo-200'>
                  <span className='font-medium'>Last check on this report:</span>{' '}
                  {g.my_verify_verdict.replace(/_/g, ' ')}
                </p>
              )}
            </div>

            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className='text-[11px]'>
                {GROUP_STATUS_LABEL[g.status] ?? g.status}
              </Badge>

              {g.diagnosis_status === 'done' && g.single_fix_feasible !== null && (
                <Badge variant='outline' className='text-[11px]'>
                  <Stethoscope className='mr-1 h-3 w-3' />
                  {g.single_fix_feasible ? 'one fix covers it' : 'needs splitting'}
                </Badge>
              )}

              {g.verify_status === 'done' && g.verify_tally && (
                <Badge variant='outline' className='text-[11px]'>
                  <CheckCircle2 className='mr-1 h-3 w-3' />
                  verified {fixed} fixed
                  {stillBroken > 0 ? ` · ${stillBroken} still broken` : ''}
                </Badge>
              )}

              {g.fix_pr_url && (
                <a
                  href={g.fix_pr_url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center text-[11px] font-medium text-indigo-800 underline underline-offset-2 dark:text-indigo-200'
                >
                  <GitPullRequest className='mr-1 h-3 w-3' />
                  fix PR
                  {g.fix_pr_number ? ` #${g.fix_pr_number}` : ''}
                </a>
              )}

              {/* The list page's tabs are local state, not URL-driven, so this
                  links to the page and names the tab rather than passing a
                  ?tab= param that would silently land on the default tab. */}
              <Link
                href='/admin/bug-reports'
                className='text-[11px] font-semibold text-indigo-800 underline underline-offset-2 dark:text-indigo-200'
              >
                Bug reports → Groups tab
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
