'use client';

/**
 * Annual Increments — who is due, how much, and who is not and why.
 *
 * WHAT THIS SCREEN IS. MyJKKN has stored each college's increment rules since
 * June 2026 — the annual window, who signs off, that performance must be
 * satisfactory, what withholds a rise, and eight performance dimensions. Not one
 * line of code had ever read them. This page reads them and reports.
 *
 * IT REPORTS. IT DOES NOT PAY. There is no apply button on this screen, no
 * mutation behind it, and no writer in the engine. The Director ruled on
 * 2026-09-18 that a pay band is reference only and that nobody's pay moves
 * without his per-person approval, so a proposal here is a proposal and nothing
 * else.
 *
 * ACTING ON ONE (rulings as of 8 Oct 2026). The notice points to Ask for a
 * salary revision: the final yes is the Director list's (#4140), nobody decides
 * their own raise (#4190), and an approved raise starts on the 1st of the month
 * after approval with no backdating (lib/hr/raise-effective-date.ts). The
 * college rules' own approver is therefore not shown.
 *
 * SEVEN OF THE NINE COLLEGES HAVE NO RULES. Those are shown as an explicit
 * banner with their people still listed, each saying what is missing — never as
 * an empty table, which would read as "nobody is due".
 *
 * Gated on hr.payroll.salary.view, the same key as Employee Salaries and TDS
 * Bands. A refusal says so in words; it never redirects.
 */

export const navMeta = {
  label: 'Annual Increments',
  icon: 'TrendingUp',
} as const;

import Link from 'next/link';
import { Info, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useIncrementReport } from '@/hooks/hr/payroll/use-increment-proposals';
import type { IncrementVerdict } from '@/lib/hr/increment-engine';

import { CollegeIncrementSection } from './_components/college-increment-section';
import { VERDICT_CLASSES, VERDICT_LABELS } from './_components/increment-verdict-badge';

const TILE_ORDER: IncrementVerdict[] = ['due', 'withheld', 'cannot_tell', 'not_due'];

function Tile({
  verdict,
  count,
  caption,
}: {
  verdict: IncrementVerdict;
  count: number;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {VERDICT_LABELS[verdict]}
      </p>
      <p className={`mt-1 text-3xl font-bold tracking-tight ${VERDICT_CLASSES[verdict]}`}>
        {count}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

export default function AnnualIncrementsPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.salary', 'view');

  const report = useIncrementReport(undefined, !permsLoading && canView);

  if (!permsLoading && !canView) {
    return (
      <ContentLayout title="Annual Increments">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Not available to your role</AlertTitle>
          <AlertDescription>
            Annual Increments shows what people are paid and what a rise would make it,
            so it needs the same permission as Employee Salaries —{' '}
            <code>hr.payroll.salary.view</code>, held by the HR Head and Super
            Administrators. Ask the HR Head if you need it.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const data = report.data;
  const totals = { due: 0, withheld: 0, cannot_tell: 0, not_due: 0, no_rules: 0 };
  let grandTotal: number | null = null;
  if (data) {
    for (const college of data.colleges) {
      for (const key of Object.keys(totals) as IncrementVerdict[]) {
        totals[key] += college.counts[key];
      }
      if (college.totalMonthlyIncrease !== null) {
        grandTotal = (grandTotal ?? 0) + college.totalMonthlyIncrease;
      }
    }
  }

  const nobodyIsPriced = totals.due > 0 && grandTotal === null;

  return (
    <ContentLayout title="Annual Increments">
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/hr">HR</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/hr/payroll">Payroll</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Annual Increments</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <TrendingUp className="h-6 w-6 text-primary" />
              Annual Increments
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Who each college&rsquo;s own rules say is due a rise
              {data?.asOf ? ` as at ${data.asOf}` : ''}, and for everyone else, why not.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => report.refetch()}
            disabled={report.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>

        {/* The ceiling, said once, at the top, where it cannot be missed. */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Nothing on this page changes anyone&rsquo;s pay</AlertTitle>
          <AlertDescription>
            <p>
              These are proposals worked out from the rules each college has saved. There is
              no button here that pays them, and there is not meant to be. Every rise stays a
              per-person decision.
            </p>
            <p className="mt-2">
              To act on one,{' '}
              <Link href="/hr/salary-revisions/ask" className="font-medium underline">
                ask for a salary revision
              </Link>
              . The final yes belongs to the Director list, nobody can decide their own
              raise, and an approved raise starts on the 1st of the month after approval,
              never earlier. A reference scale shown beside a name is for reference only.
            </p>
          </AlertDescription>
        </Alert>

        {report.isError && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Could not work out the increments</AlertTitle>
            <AlertDescription>{(report.error as Error).message}</AlertDescription>
          </Alert>
        )}

        {(permsLoading || report.isLoading) && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}

        {data?.noAccessibleColleges && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>No college is assigned to you</AlertTitle>
            <AlertDescription>
              Your account is not attached to any college that is included in HR, so there
              is nothing for this page to show. Ask the HR Head to attach you to a college
              — this is not an empty result, it is a missing assignment.
            </AlertDescription>
          </Alert>
        )}

        {data && !data.noAccessibleColleges && (
          <>
            {/*
              Five tiles, not four. The fifth is the people at colleges with no
              rules at all: without it the row does not add up to everybody, and
              a reader would take the total as the whole staff.
            */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Tile verdict="due" count={totals.due} caption="the year has passed and every condition is met" />
              <Tile verdict="withheld" count={totals.withheld} caption="a rule definitely blocks it" />
              <Tile
                verdict="cannot_tell"
                count={totals.cannot_tell}
                caption="something the rules ask for is not recorded"
              />
              <Tile verdict="not_due" count={totals.not_due} caption="the year has not passed yet" />
              <Tile
                verdict="no_rules"
                count={totals.no_rules}
                caption="their college has recorded no rules"
              />
            </div>

            {nobodyIsPriced && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No amount is set for their departments</AlertTitle>
                <AlertDescription>
                  {totals.due} {totals.due === 1 ? 'person has' : 'people have'} met every
                  condition their college&rsquo;s rules set, but the Director has not set an
                  amount per year for their department, so no figure can be shown. MyJKKN will
                  not invent one. Setting it on the salary suggestion settings page is what
                  turns this list into rupees.
                </AlertDescription>
              </Alert>
            )}

            {data.collegesWithoutRules.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>
                  {data.collegesWithoutRules.length} of the {data.colleges.length} colleges
                  you can see have no increment rules recorded
                </AlertTitle>
                <AlertDescription>
                  {data.collegesWithoutRules.join(', ')}. Nobody at those colleges can be
                  assessed until somebody records their rules. That is not the same as
                  nobody being due.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              {data.colleges.map((college) => (
                <CollegeIncrementSection key={college.institutionId} college={college} />
              ))}
            </div>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
