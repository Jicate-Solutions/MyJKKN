'use client';

/**
 * One register line, in full — how this person's net pay was arrived at.
 *
 * NO NEW ENDPOINT. useSalaryRegisterDetail(runId) is the same query the register
 * already ran, so arriving from its table costs no fetch: React Query hands back
 * the cached run and this page picks its line out of it. A per-line route would
 * have been a second way to read the same bytes, and a second thing to keep in
 * step with the RLS on hr_salary_register_lines.
 *
 * THE PAGE LEADS WITH THE ANSWER. Its whole job is "why is this number what it
 * is", so net pay is the first and largest thing on it, with the derivation
 * spelled out beneath — then the three groups that produced it, then identity as
 * reference. The previous layout opened with Employee ID and Date of joining and
 * buried the figure five cards down.
 *
 * EVERY FIGURE IS FROZEN. The line snapshots identity, payer and the salary in
 * force at generation, so a later transfer, rename or pay revision does not
 * rewrite an issued register. That is why this page reads no other table.
 */

import { use } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useSalaryRegisterDetail } from '@/hooks/hr/payroll/use-salary-register';
import { EXCLUSION_LABELS } from '@/lib/services/hr/payroll/salary-register-service';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

import { days, dmy, money } from '../../_components/register-columns';
import { MONTHS } from '../../_components/run-columns';

/** Right-aligned rupees. Zero prints as ₹0 — it is a figure, not a blank. */
const inr = (n: number) => `₹${money(n)}`;

/**
 * One label/value row.
 *
 * The label is the quiet half and the value the loud one, so a column of these
 * scans down the right edge — which is where every number on this page lives.
 */
function Row({
  label,
  value,
  mono,
  strong,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={[
          'min-w-0 text-right text-sm tabular-nums',
          mono ? 'font-mono text-xs' : '',
          strong ? 'font-semibold' : '',
          muted ? 'text-muted-foreground' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <Row label={label} strong={strong} value={inr(value)} />;
}

/**
 * `plain` skips the <dl> wrapper. A dl may contain dt/dd or a single grouping
 * div — not a grid of divs, and not a <p> — so a section that lays its rows out
 * in columns supplies its own <dl> per column instead.
 */
function Section({
  title,
  children,
  plain,
}: {
  title: string;
  children: React.ReactNode;
  plain?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {plain ? children : <dl>{children}</dl>}
      </CardContent>
    </Card>
  );
}

export default function SalaryRegisterLinePage({
  params,
}: {
  params: Promise<{ runId: string; lineId: string }>;
}) {
  const { runId, lineId } = use(params);

  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.register', 'view');

  const detail = useSalaryRegisterDetail(canView ? runId : null);

  const line: HRSalaryRegisterLine | undefined = detail.data?.lines.find(
    (l) => l.id === lineId
  );
  const run = detail.data?.run;

  // Back to the REGISTER this line belongs to, not to the index.
  const backHref = `/hr/payroll/register/${runId}`;
  const period = run ? `${MONTHS[run.period_month - 1]} ${run.period_year}` : '';

  /**
   * What the register rounded away. Computed in paise then divided, because
   * subtracting two floats here produces things like 0.30000000000000426 and
   * this number is printed.
   */
  const rounding = line
    ? (Math.round(line.net_pay * 100) -
        Math.round(
          (line.total_earnings - line.total_deductions + line.adjustment_amount) * 100
        )) / 100
    : 0;

  // A courtesy, not the control. RLS on hr_salary_register_lines and
  // requirePermission on the route handler are what actually refuse.
  if (!permsLoading && !canView) {
    return (
      <ContentLayout title="Salary Register">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Not available to your role</AlertTitle>
          <AlertDescription>
            The Salary Register needs <code>hr.payroll.register.view</code>, which is held
            by the HR Head and Super Administrators.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Salary Register">
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/hr/payroll/register">Salary Register</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={backHref}>
                  {detail.data ? `${detail.data.institution_name}, ${period}` : 'Register'}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{line?.staff_name ?? 'Line'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {detail.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        )}

        {detail.error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load the register</AlertTitle>
            <AlertDescription>{getErrorMessage(detail.error)}</AlertDescription>
          </Alert>
        )}

        {detail.data && !line && (
          <Alert>
            <AlertTitle>No such line on this register</AlertTitle>
            <AlertDescription>
              Regenerating a register replaces every line, so a link to an older run&apos;s
              row stops resolving. Open the register and pick the person again.
            </AlertDescription>
          </Alert>
        )}

        {line && run && (
          <>
            {/* h1, not h2 — this page had no h1 at all, and a screen reader
                navigating by heading needs the person to BE the top level. */}
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h1 className="truncate text-xl font-semibold">{line.staff_name}</h1>
                  <span className="font-mono text-xs text-muted-foreground">
                    {line.employee_code ?? '—'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {[line.designation, line.department_name].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {line.is_included ? (
                  <Badge variant="secondary" className="font-normal">Paid</Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400"
                  >
                    Excluded
                  </Badge>
                )}
                {run.superseded_at && (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Replaced by a newer register
                  </Badge>
                )}
              </div>
            </div>

            {/* An excluded person produced no payable row, so the money sections
                would be a page of zeroes claiming things about a payment that
                never happened. The reason replaces them. */}
            {!line.is_included && (
              <Alert>
                <AlertTitle>Not paid on this register</AlertTitle>
                <AlertDescription>
                  {line.exclusion_reason
                    ? EXCLUSION_LABELS[line.exclusion_reason]
                    : 'Reason not recorded.'}{' '}
                  Fix the cause and regenerate the register.
                </AlertDescription>
              </Alert>
            )}

            {line.is_included && (
              <>
                {/*
                  THE ANSWER FIRST. Everything below this card explains this
                  number, so it leads rather than concludes — and the derivation
                  sits with it, because "why 16,141 and not 16,500" is the whole
                  question someone opens this page with.
                */}
                <Card>
                  <CardContent className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 p-5">
                    <div>
                      <div className="text-3xl font-semibold tabular-nums">
                        {inr(line.net_pay)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Net pay for {period}
                      </div>
                    </div>

                    {/* The sum, written out. Reads left to right in the order the
                        register applies it. */}
                    <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
                      <div className="flex items-baseline gap-1.5">
                        <dt className="text-xs text-muted-foreground">Earnings</dt>
                        <dd className="tabular-nums">{inr(line.total_earnings)}</dd>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <dt className="text-xs text-muted-foreground">less deductions</dt>
                        <dd className="tabular-nums">{inr(line.total_deductions)}</dd>
                      </div>
                      {line.adjustment_amount !== 0 && (
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-xs text-muted-foreground">adjustment</dt>
                          <dd className="tabular-nums">{inr(line.adjustment_amount)}</dd>
                        </div>
                      )}
                      {/* NET PAY IS ROUNDED TO WHOLE RUPEES. Verified against every
                          included line in production: all 49 satisfy
                          net = round(earnings − deductions + adjustment), gap never
                          more than ₹0.48. Without this the figures visibly fail to
                          add up on 38 of them, which on a payroll page reads as an
                          error rather than as rounding. */}
                      {rounding !== 0 && (
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-xs text-muted-foreground">rounding</dt>
                          <dd className="tabular-nums">{inr(rounding)}</dd>
                        </div>
                      )}
                    </dl>
                  </CardContent>
                </Card>

                {/* The three groups that produced it. Equal weight, because none
                    of them is more the reason than the others. */}
                <div className="grid gap-4 lg:grid-cols-3">
                  <Section title="Attendance">
                    <Row
                      label="Business working days"
                      value={days(line.business_working_days)}
                    />
                    <Row label="Paid leave" value={days(line.paid_leave_days)} />
                    <Row
                      label="Unpaid leave"
                      value={
                        <span
                          className={
                            line.unpaid_leave_days > 0 ? 'font-medium text-destructive' : ''
                          }
                        >
                          {days(line.unpaid_leave_days)}
                        </span>
                      }
                    />
                    <Row label="On duty" value={days(line.on_duty_days)} />
                    <Row label="Worked" value={days(line.worked_days)} />
                    <Row label="Paid days" strong value={days(line.paid_days)} />
                    {/* The divisor is the institution's month standard, frozen
                        with the run — not a per-staff number — which is what
                        makes two people on the same register comparable. */}
                    <Row
                      label="Day-rate divisor"
                      muted
                      value={days(run.working_days_basis)}
                    />
                  </Section>

                  <Section title="Earnings">
                    <MoneyRow label="Actual gross, full month" value={line.actual_gross} />
                    <MoneyRow label="Basic pay" value={line.basic_pay} />
                    <MoneyRow label="Allowance" value={line.allowance} />
                    <MoneyRow label="Total" value={line.total_earnings} strong />
                  </Section>

                  <Section title="Deductions">
                    <MoneyRow label="Unpaid leave" value={line.unpaid_leave_deduction} />
                    <MoneyRow label="EPF" value={line.epf_deduction} />
                    <MoneyRow label="ESI" value={line.esi_deduction} />
                    <MoneyRow label="TDS" value={line.tds_deduction} />
                    <MoneyRow label="Total" value={line.total_deductions} strong />
                  </Section>
                </div>
              </>
            )}

            {/* Reference, not argument — so it sits last, and wide rather than
                in a column where its long values would wrap. */}
            <Section title="On the register" plain>
              <div className="grid gap-x-8 sm:grid-cols-2">
                <dl>
                  <Row label="Employee ID" value={line.employee_code ?? '—'} mono />
                  <Row label="Designation" value={line.designation ?? '—'} />
                  <Row label="Department" value={line.department_name ?? '—'} />
                  <Row label="Row number" value={line.serial_no} />
                </dl>
                <dl>
                  <Row label="Date of joining" value={dmy(line.date_of_joining)} />
                  <Row
                    label="Bank account"
                    mono
                    value={
                      line.bank_account_number ?? (
                        // Not merely missing: nobody can be paid without it.
                        <span className="font-sans text-xs text-amber-700 dark:text-amber-500">
                          not recorded
                        </span>
                      )
                    }
                  />
                  <Row
                    label="Paid by"
                    value={
                      line.paid_by_name ?? (
                        <span className="text-xs text-amber-700 dark:text-amber-500">
                          not recorded
                        </span>
                      )
                    }
                  />
                  <Row label="Institution" value={detail.data?.institution_name ?? '—'} />
                </dl>
              </div>
              {line.remarks && (
                <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-xs text-muted-foreground">
                  {line.remarks}
                </p>
              )}
            </Section>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
