'use client';

/**
 * One frozen register: what it totals, who is on it, and how to get it out.
 *
 * Split off the index on 2026-09-08. The register list, the generate flow and
 * one register's contents used to share a single screen, so opening the page you
 * wanted meant scrolling past two you did not.
 *
 * EVERY FIGURE HERE IS FROZEN. The run snapshots its own totals and the lines
 * snapshot identity, payer and the salary in force at generation, so a later
 * transfer, rename or pay revision cannot rewrite an issued register. Nothing on
 * this page recomputes anything — the one exception is the adjustment dialog,
 * which writes a line and lets the database re-total.
 *
 * A SUPERSEDED RUN IS STILL READABLE. Regenerating a month replaces the register
 * but the old one may be what somebody already acted on, so it opens normally —
 * badged, and with Adjust suppressed, because editing history is not a thing
 * this page should offer.
 */

import { use, useCallback, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Download, ShieldAlert } from 'lucide-react';

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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  salaryRegisterExportUrl,
  useSalaryRegisterDetail,
  useUpdateSalaryRegisterLine,
} from '@/hooks/hr/payroll/use-salary-register';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

import { AdjustmentDialog } from '../_components/adjustment-dialog';
import { RegisterDataTable } from '../_components/register-data-table';
import {
  DEFAULT_REGISTER_FILTERS,
  RegisterFilters,
  type RegisterFilterState,
} from '../_components/register-filters';
import { MONTHS, inr } from '../_components/run-columns';

/**
 * One figure and what it is.
 *
 * THE VALUE IS THE HEADLINE, the label its caption — figure first, in a size
 * that says how much it matters. A dense operational surface earns its scanning
 * from that contrast, not from borders around every number.
 *
 * `size` follows the page's type scale (14 / 18 / 24) rather than an arbitrary
 * number per call site: `sm` for counts of people, `md` for money that feeds a
 * total, `lg` for the total itself.
 */
function Figure({
  label,
  value,
  size = 'md',
  tone,
}: {
  label: string;
  value: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'muted' | 'warn';
}) {
  const scale =
    size === 'lg' ? 'text-2xl font-semibold' : size === 'md' ? 'text-lg' : 'text-base';
  const colour =
    tone === 'warn'
      ? ' text-amber-700 dark:text-amber-500'
      : tone === 'muted'
        ? ' text-muted-foreground'
        : '';
  return (
    <div className="min-w-0">
      <div className={`tabular-nums ${scale}${colour}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function SalaryRegisterRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);

  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.register', 'view');
  const canManage = canAccess('hr.payroll.register', 'manage');

  const detail = useSalaryRegisterDetail(canView ? runId : null);
  const updateLine = useUpdateSalaryRegisterLine(runId);

  const [adjustLine, setAdjustLine] = useState<HRSalaryRegisterLine | null>(null);
  // Opens on the payable rows. Excluded people are a filter away rather than a
  // second table — they are the work list, not a footnote.
  const [filters, setFilters] = useState<RegisterFilterState>(DEFAULT_REGISTER_FILTERS);

  const detailHref = useCallback(
    (line: HRSalaryRegisterLine) => `/hr/payroll/register/${line.run_id}/${line.id}`,
    [],
  );

  const handleSaveAdjustment = useCallback(
    (input: { lineId: string; adjustmentAmount: number; remarks: string | null }) => {
      updateLine.mutate(input, {
        onSuccess: () => {
          toast.success('Adjustment saved.');
          setAdjustLine(null);
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      });
    },
    [updateLine],
  );

  // A courtesy, not the control. RLS on the two register tables and
  // requirePermission on every route handler are what actually refuse.
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

  const run = detail.data?.run;
  const period = run ? `${MONTHS[run.period_month - 1]} ${run.period_year}` : '';

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
              <BreadcrumbPage>
                {detail.data ? `${detail.data.institution_name}, ${period}` : 'Register'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {detail.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {detail.error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load this register</AlertTitle>
            <AlertDescription>{getErrorMessage(detail.error)}</AlertDescription>
          </Alert>
        )}

        {detail.data && run && (
          <>
            {/* h1, not h2 — the page had no h1 at all, and a screen reader
                navigating by heading needs the register to BE the top level. */}
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">
                  {detail.data.institution_name}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {period}
                  {run.superseded_at ? ' — replaced by a newer register' : ''}
                </p>
              </div>

              {/* The one action on this page, so it sits with the title rather
                  than competing with the figures below. A plain link, not a
                  fetch: the route streams the file and names it. */}
              <Button asChild className="shrink-0">
                <a href={salaryRegisterExportUrl(run.id)} download>
                  <Download className="mr-2 h-4 w-4" />
                  Export workbook
                </a>
              </Button>
            </div>

            {/*
              TWO GROUPS, NOT SIX EQUAL TILES. People and money answer different
              questions, and a flat row of six made the reader work out which was
              which. The divider carries that structure; the type scale carries
              the hierarchy, so Net payable — the figure the whole page exists to
              produce — is the largest thing on it.

              Stacks below sm and splits at md, so nothing is cramped at 375px
              and nothing is stranded at 1440px.
            */}
            <Card>
              <CardContent className="grid gap-6 p-5 md:grid-cols-[auto_1fr] md:gap-10">
                <div className="grid grid-cols-3 gap-x-6 gap-y-3 md:pr-10">
                  <Figure label="On the roster" value={String(run.staff_total)} size="sm" />
                  <Figure label="Paid" value={String(run.included_count)} size="sm" />
                  <Figure
                    label="Excluded"
                    value={String(run.excluded_count)}
                    size="sm"
                    tone={run.excluded_count > 0 ? 'warn' : 'muted'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-6 sm:grid-cols-3 md:border-l md:border-t-0 md:pl-10 md:pt-0">
                  <Figure label="Gross" value={inr(run.total_gross)} />
                  <Figure label="Deductions" value={inr(run.total_deductions)} />
                  <Figure label="Net payable" value={inr(run.total_net)} size="lg" />
                </div>
              </CardContent>
            </Card>

            {/* Filters belong TO the table, so they share its surface instead of
                floating above it as an unrelated toolbar. */}
            <section aria-label="Register lines" className="space-y-3">
              <RegisterFilters
                lines={detail.data.lines}
                filters={filters}
                onChange={setFilters}
              />
              <RegisterDataTable
                lines={detail.data.lines}
                filters={filters}
                canManage={canManage}
                isSuperseded={Boolean(run.superseded_at)}
                detailHref={detailHref}
                onAdjust={setAdjustLine}
              />
            </section>
          </>
        )}

        <AdjustmentDialog
          line={adjustLine}
          open={Boolean(adjustLine)}
          isSaving={updateLine.isPending}
          onOpenChange={(open) => { if (!open) setAdjustLine(null); }}
          onSave={handleSaveAdjustment}
        />
      </div>
    </ContentLayout>
  );
}
