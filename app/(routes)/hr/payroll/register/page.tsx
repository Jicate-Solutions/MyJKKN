'use client';

/**
 * Salary Register — the step AFTER the attendance month is closed.
 *
 * THE CHAIN. Punches are imported, staff raise leave / short time off /
 * comp-off, approvals recompute the affected days, HR Head closes the month and
 * the per-staff day counts freeze. This page turns those frozen counts plus the
 * recorded salary into a register, and exports it as the workbook HR already
 * keeps by hand.
 *
 * THE ROSTER IS THE WORK LOCATION (revised 2026-08-30). staff.institution_id
 * groups the register — the same key the attendance close uses — so a register
 * waits on exactly one month and every active staff member appears on exactly
 * one register.
 *
 * Payer scoping came first and failed on contact: Main Office is a real
 * workplace that pays nobody, so it could never have a register, and 105 staff
 * with no payer recorded landed on none at all. Who PAYS is still carried, per
 * row and as per-payer subtotals in the export.
 *
 * The roster is also gated on employment_categories.included_in_hr (via
 * v_hr_staff), the same gate the rest of the HR module runs on — so Ayaah,
 * Driver, Security and the other non-HR categories never reach a register.
 *
 * SUPER ADMIN AND HR HEAD ONLY. hr.payroll.register.view/.manage were granted
 * to HR Head alone in 20260830150000_hr_salary_register.sql, because it is the
 * only role already holding all four keys a run must read through. The denial
 * is enforced in Postgres — by the two tables' RLS and by requirePermission on
 * every route handler. The check below only decides what to SAY to someone who
 * reaches the URL.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import {
  salaryRegisterExportUrl,
  useGenerateSalaryRegister,
  useSalaryRegisterDetail,
  useSalaryRegisterPreflight,
  useSalaryRegisterRuns,
  useUpdateSalaryRegisterLine,
} from '@/hooks/hr/payroll/use-salary-register';
import type { HRSalaryRegisterLine } from '@/types/hr-payroll';

import { ReadinessPanel } from './_components/readiness-panel';
import { RegisterTable } from './_components/register-table';
import { AdjustmentDialog } from './_components/adjustment-dialog';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Current year/month in IST — the server is not necessarily in Asia/Kolkata. */
function nowIST(): { year: number; month: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
  }).format(new Date());
  const [y, m] = p.split('-').map(Number);
  return { year: y, month: m };
}

/** Payroll is run for the month just ENDED, so that is where the page opens. */
function previousMonth(): { year: number; month: number } {
  const { year, month } = nowIST();
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * useSearchParams suspends during prerender, so the content sits behind its own
 * boundary. Without it the whole route opts into dynamic rendering and the
 * build warns.
 */
export default function SalaryRegisterPage() {
  return (
    <Suspense
      fallback={
        <ContentLayout title="Salary Register">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </ContentLayout>
      }
    >
      <SalaryRegisterContent />
    </Suspense>
  );
}

function SalaryRegisterContent() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.register', 'view');
  const canManage = canAccess('hr.payroll.register', 'manage');

  // Deep link from Attendance · Month Close: ?institution=<uuid>&year=&month=.
  // Keyed on institution_id rather than hr_organization_id because that is what
  // the close console holds — the mapping is resolved below.
  const searchParams = useSearchParams();
  const linkedInstitution = searchParams.get('institution');
  const linkedYear = Number(searchParams.get('year'));
  const linkedMonth = Number(searchParams.get('month'));

  const initial = useMemo(() => {
    const fallback = previousMonth();
    const validYear = Number.isInteger(linkedYear) && linkedYear > 2000 && linkedYear < 2100;
    const validMonth = Number.isInteger(linkedMonth) && linkedMonth >= 1 && linkedMonth <= 12;
    return validYear && validMonth
      ? { year: linkedYear, month: linkedMonth }
      : fallback;
    // Read once on mount — afterwards the pickers own this state, and
    // re-syncing would fight the user's own month stepping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [adjustLine, setAdjustLine] = useState<HRSalaryRegisterLine | null>(null);

  const { mappings, isLoading: orgsLoading } = useHrOrgMappings();

  // Honour the deep-linked institution when its org mapping arrives; otherwise
  // default to the first accessible one rather than leaving the picker empty —
  // an empty page reads as "nothing here" rather than "choose one".
  useEffect(() => {
    if (orgId || mappings.length === 0) return;
    const linked = linkedInstitution
      ? mappings.find((m) => m.institution_id === linkedInstitution)
      : undefined;
    setOrgId((linked ?? mappings[0]).hr_organization_id);
  }, [orgId, mappings, linkedInstitution]);

  const preflight = useSalaryRegisterPreflight(orgId, year, month);
  const runs = useSalaryRegisterRuns(orgId ?? undefined, year);
  const generate = useGenerateSalaryRegister();

  // The live run for the month on screen, if one has been generated.
  const currentRun = useMemo(
    () => (runs.data ?? []).find((r) => r.period_month === month && r.period_year === year) ?? null,
    [runs.data, month, year],
  );

  const detail = useSalaryRegisterDetail(currentRun?.id ?? null);
  const updateLine = useUpdateSalaryRegisterLine(currentRun?.id ?? '');

  const stepMonth = useCallback((delta: number) => {
    setMonth((m) => {
      const next = m + delta;
      if (next < 1) { setYear((y) => y - 1); return 12; }
      if (next > 12) { setYear((y) => y + 1); return 1; }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!orgId) return;
    generate.mutate(
      { hrOrganizationId: orgId, year, month },
      {
        onSuccess: (res) => {
          toast.success(
            res.excluded > 0
              ? `Register generated — ${res.included} payable, ${res.excluded} excluded.`
              : `Register generated for ${res.included} staff.`,
          );
        },
        // The service's refusals are the whole point of the readiness panel, so
        // they are surfaced verbatim rather than replaced with a generic failure.
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  }, [orgId, year, month, generate]);

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

  if (!permsLoading && !canView) {
    return (
      <ContentLayout title="Salary Register">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Not available to this account</AlertTitle>
          <AlertDescription>
            The salary register is restricted to HR Head and super administrators. It shows every
            staff member&apos;s pay, bank account and day counts on one screen.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const orgName =
    mappings.find((m) => m.hr_organization_id === orgId)?.organization_name ?? 'institution';

  return (
    <ContentLayout title="Salary Register">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>HR</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>Payroll</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Salary Register</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Salary Register</h1>
          <p className="text-sm text-muted-foreground">
            Generated from the closed attendance month and each person&apos;s recorded salary.
            Close the month in{' '}
            <Link href="/hr/attendance/close" className="underline underline-offset-2">
              Attendance · Month Close
            </Link>{' '}
            first.
          </p>
        </header>

        {/* Picker */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[16rem] flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Institution
              </label>
              <Select value={orgId ?? undefined} onValueChange={setOrgId} disabled={orgsLoading}>
                <SelectTrigger><SelectValue placeholder="Select an institution" /></SelectTrigger>
                <SelectContent>
                  {mappings.map((m) => (
                    <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                      {m.organization_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Month</label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => stepMonth(-1)} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex min-w-[10rem] items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  {MONTHS[month - 1]} {year}
                </div>
                <Button variant="outline" size="icon" onClick={() => stepMonth(1)} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => { preflight.refetch(); runs.refetch(); }}
              disabled={preflight.isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${preflight.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardContent>
        </Card>

        <ReadinessPanel
          preflight={preflight.data}
          isLoading={preflight.isLoading}
          error={(preflight.error as Error) ?? null}
          canManage={canManage}
          isGenerating={generate.isPending}
          onGenerate={handleGenerate}
        />

        {currentRun && (
          <div className="space-y-4">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Total earnings</div>
                    <div className="text-lg font-semibold">₹{money(currentRun.total_gross)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total deductions</div>
                    <div className="text-lg font-semibold">₹{money(currentRun.total_deductions)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Net payable</div>
                    <div className="text-lg font-semibold">₹{money(currentRun.total_net)}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Badge variant="secondary" className="w-fit">
                      {currentRun.included_count} paid
                    </Badge>
                    {currentRun.excluded_count > 0 && (
                      <Badge variant="outline" className="w-fit">
                        {currentRun.excluded_count} excluded
                      </Badge>
                    )}
                  </div>
                </div>

                {/* A plain link, not a fetch: the route streams the file and
                    names it, so the browser's own download handles it. */}
                <Button asChild>
                  <a href={salaryRegisterExportUrl(currentRun.id)} download>
                    <Download className="mr-2 h-4 w-4" />
                    Export workbook
                  </a>
                </Button>
              </CardContent>
            </Card>

            {detail.isLoading && (
              <p className="text-sm text-muted-foreground">Loading the register…</p>
            )}
            {detail.error && (
              <Alert variant="destructive">
                <AlertTitle>Could not load the register</AlertTitle>
                <AlertDescription>{getErrorMessage(detail.error)}</AlertDescription>
              </Alert>
            )}
            {detail.data && (
              <RegisterTable
                lines={detail.data.lines}
                canManage={canManage}
                isSuperseded={Boolean(detail.data.run.superseded_at)}
                onAdjust={setAdjustLine}
              />
            )}
          </div>
        )}

        {!currentRun && !preflight.isLoading && preflight.data?.can_generate && (
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertTitle>No register yet for {MONTHS[month - 1]} {year}</AlertTitle>
            <AlertDescription>
              {orgName} is ready. Generate the register to freeze this month&apos;s figures.
            </AlertDescription>
          </Alert>
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
