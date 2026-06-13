'use client';

/**
 * /hr/admin/payroll/periods/[id] — period detail page (T4.3 PR 3).
 *
 * Spec: specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md (Q2 + Q3 + Q6 + Q8 + E7 + E10 + E12)
 *
 * Layout:
 *   1. Header — period label + status pill + backdate badge + action buttons
 *   2. Horizontal stepper — 6 stages with check marks for reached
 *   3. Period summary card — year/month/institution/engine_type/working_days/calendar_days
 *   4. Audit timeline — full event history (everyone in chain sees everything)
 *
 * Realtime: usePayrollPeriodRealtime subscribes to UPDATEs on hr_payroll_periods
 * for this id; cache invalidates when another actor advances/rejects.
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { usePayrollPeriod } from '@/hooks/hr/payroll/use-payroll-period';
import { usePayrollApprovals } from '@/hooks/hr/payroll/use-payroll-approvals';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';

import { PeriodStatusPill } from '@/features/hr/payroll/period-status-pill';
import { PeriodBackdateBadge } from '@/features/hr/payroll/period-backdate-badge';
import { PeriodDetailStepper } from '@/features/hr/payroll/period-detail-stepper';
import { PeriodAuditTimeline } from '@/features/hr/payroll/period-audit-timeline';
import { PeriodActionButtons } from '@/features/hr/payroll/period-action-buttons';
import { PayslipTable } from '@/features/hr/payroll/payslip-table';
import { usePayrollPeriodRealtime } from '@/features/hr/payroll/use-payroll-period-realtime';
import { usePayrollPayslips, type PayslipWithStaff } from '@/hooks/hr/payroll/use-payroll-payslips';
import { PayslipOverrideDialog } from '@/features/hr/payroll/payslip-override-dialog';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ENGINE_LABELS: Record<string, string> = {
  faculty: 'Faculty (teaching)',
  non_teaching: 'Non-teaching',
};

export default function PayrollPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <SuperAdminOnly>
      <ContentLayout title="Payroll Period">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'HR' },
            { label: 'Payroll' },
            { label: 'Periods', href: '/hr/admin/payroll/periods' },
            { label: 'Detail' },
          ]}
        />
        <PayrollPeriodDetailContent id={id} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function PayrollPeriodDetailContent({ id }: { id: string }) {
  const { data: period, isLoading, error } = usePayrollPeriod(id);
  const { data: approvals = [], isLoading: approvalsLoading } = usePayrollApprovals(id);
  const { data: payslips = [], isLoading: payslipsLoading } = usePayrollPayslips(id);
  const { data: institutionsData } = useJkknInstitutions({ limit: 50 });
  const [overrideSlip, setOverrideSlip] = useState<PayslipWithStaff | null>(null);

  // Realtime subscription — caches invalidate when other actors transition
  usePayrollPeriodRealtime(id);

  const institutionName = period
    ? (institutionsData?.data ?? []).find((i) => i.id === period.institution_id)?.name
    : undefined;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load this period</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !period) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-20 bg-muted/60 animate-pulse rounded" />
        <div className="h-32 bg-muted/60 animate-pulse rounded" />
      </div>
    );
  }

  const periodLabel = `${MONTH_NAMES[period.period_month - 1]} ${period.period_year}`;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/hr/admin/payroll/periods">
          <ArrowLeft className="mr-1 h-4 w-4" />
          All periods
        </Link>
      </Button>

      {/* Header — title + status + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">
            {periodLabel} payroll
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodStatusPill status={period.status} />
            <PeriodBackdateBadge
              isBackdated={period.is_backdated}
              reason={period.backdate_reason}
            />
            {institutionName && (
              <span className="text-sm text-muted-foreground">· {institutionName}</span>
            )}
            <span className="text-sm text-muted-foreground">
              · {ENGINE_LABELS[period.engine_type] ?? period.engine_type}
            </span>
          </div>
        </div>

        <PeriodActionButtons period={period} />
      </div>

      {/* Stepper */}
      <PeriodDetailStepper period={period} userLookup={{}} />

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle>Period summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Engine</dt>
              <dd className="font-medium">{ENGINE_LABELS[period.engine_type] ?? period.engine_type}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Calendar days</dt>
              <dd className="font-medium">{period.total_calendar_days ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Working days</dt>
              <dd className="font-medium">{period.working_days_count ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Created</dt>
              <dd className="font-medium">
                {new Date(period.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Payslips table — visible once period is at least 'prepared' */}
      {period.status !== 'draft' && (
        <PayslipTable
          payslips={payslips}
          periodLabel={periodLabel}
          isLoading={payslipsLoading}
          onOverride={setOverrideSlip}
        />
      )}

      {/* Override dialog */}
      {overrideSlip && (
        <PayslipOverrideDialog
          open={!!overrideSlip}
          onOpenChange={(open) => { if (!open) setOverrideSlip(null); }}
          periodId={id}
          slipId={overrideSlip.id}
          staffName={`${overrideSlip.staff?.first_name ?? ''} ${overrideSlip.staff?.last_name ?? ''}`.trim()}
          currentGross={overrideSlip.gross_amount}
          currentDeductions={overrideSlip.total_deductions}
        />
      )}

      {/* Audit timeline */}
      <PeriodAuditTimeline
        approvals={approvals}
        userLookup={{}}
        isLoading={approvalsLoading}
      />
    </div>
  );
}
