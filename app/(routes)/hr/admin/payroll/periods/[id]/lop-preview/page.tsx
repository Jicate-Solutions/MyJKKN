'use client';

/**
 * /hr/admin/payroll/periods/[id]/lop-preview
 *
 * WHAT ABSENCE WILL COST, BEFORE ANY MONEY MOVES.
 *
 * Until 2026-09-29 payroll paid everybody as if they had been present every
 * working day of the month. It now reads the day counts frozen when each
 * person's work location closed the attendance month. This screen is how a
 * human sees the effect of that BEFORE a payslip exists: per person, the days
 * the month pays for, the days it does not, and the rupees.
 *
 * READS ONLY. Every figure comes from the generator's own preview path, so what
 * this screen shows is what a real run would produce — not a second
 * implementation that can drift away from it.
 */

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Info, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { usePayrollLopPreview } from '@/hooks/hr/payroll/use-payroll-lop-preview';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Days print as 22 or 21.5, never 21.50. */
function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function PayrollLopPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Absence preview">
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>You don&apos;t have access to this screen</AlertTitle>
            <AlertDescription>
              Payroll screens are restricted to platform administrators. Ask the HR
              Head or a platform administrator to open this month for you, or to
              give your role payroll access.
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      <ContentLayout title="Absence preview">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'HR' },
            { label: 'Payroll' },
            { label: 'Periods', href: '/hr/admin/payroll/periods' },
            { label: 'Detail', href: `/hr/admin/payroll/periods/${id}` },
            { label: 'Absence preview' },
          ]}
        />
        <LopPreviewContent id={id} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function LopPreviewContent({ id }: { id: string }) {
  const { data, isLoading, error } = usePayrollLopPreview(id);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink id={id} />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not work out this month&apos;s absence</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted/60" />
        <div className="h-64 animate-pulse rounded bg-muted/60" />
      </div>
    );
  }

  const periodLabel = `${MONTH_NAMES[data.period.period_month - 1]} ${data.period.period_year}`;
  const absent = data.rows.filter((r) => r.payable && r.lop_days > 0);
  const payableRows = data.rows.filter((r) => r.payable);
  const skippedRows = data.rows.filter((r) => !r.payable);

  return (
    <div className="space-y-4">
      <BackLink id={id} />

      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {periodLabel} · absence and its effect on pay
              </CardTitle>
              <CardDescription>
                Nothing here has been saved. This is what a payroll run would pay
                today, worked out by the same code that produces the payslips.
              </CardDescription>
            </div>
            <Badge variant="outline">{data.period.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="People on this payroll" value={String(data.payable_count)} />
            {/* Green means "checked, nothing held back" — not "nobody to check". */}
            <Stat
              label="Days not paid for"
              value={formatDays(data.total_lop_days)}
              tone={data.total_lop_days > 0 ? 'warn' : data.payable_count > 0 ? 'ok' : 'plain'}
            />
            <Stat
              label="Held back for absence"
              value={formatINR(data.totals.lop_amount)}
              tone={data.totals.lop_amount > 0 ? 'warn' : data.payable_count > 0 ? 'ok' : 'plain'}
            />
            <Stat label="Net to be paid" value={formatINR(data.totals.net)} />
          </div>

          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">How a day is priced.</span>{' '}
            The salary is a fixed monthly figure — it does not change with the
            length of the month. One absent day costs that figure divided by the
            month&apos;s working days (the calendar month minus weekly offs and
            holidays) for that person. A month with fewer working days therefore
            makes each absent day cost more, which is the same rule the salary
            register already pays by.
          </div>

          <div className="mt-3 rounded-md border border-amber-700/30 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-semibold">Check the attendance month was complete before it was closed.</span>{' '}
            These figures come from the closed attendance month and are only as good
            as it is. If the biometric report for that month was only half imported
            when the month was closed, the uncovered days count as absence — so a
            month closed halfway through would take roughly half a month&apos;s pay
            from people who worked it. Confirm the month&apos;s import coverage on the
            attendance close screen before approving anything here.
          </div>

          <div className="mt-3 rounded-md border border-amber-700/30 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-semibold">Lock attendance before re-running a payroll month already under way.</span>{' '}
            Payroll now pays only people whose work location has locked that month&apos;s
            attendance. Re-run a month before it is locked and everyone there is left
            off, each with the reason shown below.
          </div>
        </CardContent>
      </Card>

      {data.warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Worth checking before you pay</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc space-y-1">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Payable people */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            {/*
              Nobody payable is its own case. Falling through to the "present"
              wording would print "All 0 people were present for every working
              day" over a payroll that can pay nobody at all.
            */}
            {payableRows.length === 0
              ? 'Nobody on this payroll can be paid yet'
              : absent.length > 0
                ? `${absent.length} of ${payableRows.length} people have days that are not paid for`
                : `All ${payableRows.length} people were present for every working day`}
          </CardTitle>
          <CardDescription>
            &ldquo;Paid for&rdquo; includes days worked, approved paid leave and on-duty days.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {payableRows.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              Nobody on this payroll can be paid from attendance yet. The list below
              says why for each person.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Working days</TableHead>
                    <TableHead className="text-right">Paid for</TableHead>
                    <TableHead className="text-right">Not paid for</TableHead>
                    <TableHead className="text-right">Full month</TableHead>
                    <TableHead className="text-right">Held back</TableHead>
                    <TableHead className="text-right">Net pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payableRows.map((r) => (
                    <TableRow key={r.staff_id}>
                      <TableCell className="font-medium">
                        {r.name}
                        {r.unprocessed_days > 0 && (
                          <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                            {formatDays(r.unprocessed_days)} day(s) unjudged
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDays(r.business_working_days)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDays(r.paid_days)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.lop_days > 0 ? (
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            {formatDays(r.lop_days)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatINR(r.full_gross)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.lop_amount > 0 ? (
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            −{formatINR(r.lop_amount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatINR(r.net_pay)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* People who cannot be paid from attendance */}
      {skippedRows.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {skippedRows.length} person(s) are not on this payroll
            </CardTitle>
            <CardDescription>
              Each one is left out on purpose rather than paid a guessed figure.
              Fix the reason and reload this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Why they are left out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skippedRows.map((r) => (
                    <TableRow key={r.staff_id}>
                      <TableCell className="font-medium align-top">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href={`/hr/admin/payroll/periods/${id}`}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to the period
      </Link>
    </Button>
  );
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'ok' | 'warn';
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'ok'
        ? 'text-green-700 dark:text-emerald-400'
        : 'text-foreground';

  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-tone={tone} className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
