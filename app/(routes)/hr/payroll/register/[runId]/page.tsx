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

import { use, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ChevronDown, Download, FileText, Settings2, ShieldAlert } from 'lucide-react';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  salaryRegisterExportUrl,
  usePayrollDocumentSettings,
  useSalaryRegisterDetail,
  useUpdateSalaryRegisterLine,
} from '@/hooks/hr/payroll/use-salary-register';
import {
  PAYROLL_DOCUMENT_LABEL,
  STAFF_CATEGORY_KEYS,
  STAFF_CATEGORY_LABEL,
  allLinesForCategory,
  linesForCategory,
  registerFigures,
} from '@/lib/services/hr/payroll/salary-register-document-model';
import type {
  HRSalaryRegisterLine,
  PayrollDocumentKind,
  StaffCategoryKey,
} from '@/types/hr-payroll';

import { AdjustmentDialog } from '../_components/adjustment-dialog';
import { BankStatementTable } from '../_components/bank-statement-table';
import {
  DocumentDownloadDialog,
  type DocumentRequestTarget,
} from '../_components/document-download-dialog';
import { DocumentSettingsDialog } from '../_components/document-settings-dialog';
import { RegisterDataTable } from '../_components/register-data-table';
import { SignoffPanel } from '../_components/signoff-panel';
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

  /*
   * TEACHING / NON-TEACHING (2026-10-07). The tab narrows everything below it —
   * the figures, the register and the bank statement — to one staff category,
   * keyed on the line's snapshotted is_teaching. The Register / Bank statement
   * toggle switches between the full register and the transfer list.
   */
  const [tab, setTab] = useState<'all' | StaffCategoryKey>('all');
  const [view, setView] = useState<'register' | 'bank'>('register');
  const [docTarget, setDocTarget] = useState<DocumentRequestTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The document a person was about to download when they stopped to enter the
  // college details — reopened once the details dialog closes.
  const [resumeTarget, setResumeTarget] = useState<DocumentRequestTarget | null>(null);

  /*
   * Never open one Radix dialog in the same tick another (or the dropdown) is
   * closing — the overlays race and leave body `pointer-events: none`. Each
   * hand-off closes first and opens on the next tick (radix-dialog-race-fix).
   */
  const openDocument = useCallback((target: DocumentRequestTarget) => {
    setTimeout(() => setDocTarget(target), 0);
  }, []);
  const openSettingsFromMenu = useCallback(() => {
    setTimeout(() => setSettingsOpen(true), 0);
  }, []);
  const openSettingsFromDocument = useCallback(() => {
    setResumeTarget(docTarget);
    setDocTarget(null);
    setTimeout(() => setSettingsOpen(true), 0);
  }, [docTarget]);
  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsOpen(open);
      if (!open && resumeTarget) {
        const target = resumeTarget;
        setResumeTarget(null);
        setTimeout(() => setDocTarget(target), 0);
      }
    },
    [resumeTarget],
  );

  const docSettings = usePayrollDocumentSettings(
    canView ? detail.data?.run.hr_organization_id ?? null : null,
  );

  const allLines = detail.data?.lines;
  const tabLines = useMemo(() => {
    if (!allLines) return [];
    return tab === 'all' ? allLines : allLinesForCategory(allLines, tab);
  }, [allLines, tab]);
  const tabFigures = useMemo(() => registerFigures(tabLines), [tabLines]);
  const tabPaidLines = useMemo(() => tabLines.filter((l) => l.is_included), [tabLines]);
  const paidByCategory = useMemo(
    () => ({
      teaching: allLines ? linesForCategory(allLines, 'teaching').length : 0,
      non_teaching: allLines ? linesForCategory(allLines, 'non_teaching').length : 0,
    }),
    [allLines],
  );
  const countByCategory = useMemo(
    () => ({
      teaching: allLines ? allLinesForCategory(allLines, 'teaching').length : 0,
      non_teaching: allLines ? allLinesForCategory(allLines, 'non_teaching').length : 0,
    }),
    [allLines],
  );

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

              {/* The page's outputs sit with the title rather than competing
                  with the figures below. The workbook is a plain link (the
                  route streams the file and names it); the Word documents go
                  through a dialog that previews what they will print. */}
              <div className="flex shrink-0 flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <FileText className="mr-2 h-4 w-4" />
                      Documents
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {(['bank_letter', 'chairperson_approval'] as PayrollDocumentKind[]).map((doc, i) => (
                      <div key={doc}>
                        {i > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel>{PAYROLL_DOCUMENT_LABEL[doc]}</DropdownMenuLabel>
                        {STAFF_CATEGORY_KEYS.map((category) => {
                          const paid = paidByCategory[category];
                          return (
                            <DropdownMenuItem
                              key={category}
                              disabled={paid === 0}
                              onSelect={() => openDocument({ doc, category })}
                            >
                              <span className="flex-1">{STAFF_CATEGORY_LABEL[category]} staff</span>
                              <span className="text-xs text-muted-foreground">
                                {paid === 0 ? 'no paid staff' : paid}
                              </span>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    ))}
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={openSettingsFromMenu}>
                          <Settings2 className="mr-2 h-4 w-4" />
                          College document details…
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button asChild>
                  <a href={salaryRegisterExportUrl(run.id)} download>
                    <Download className="mr-2 h-4 w-4" />
                    Export workbook
                  </a>
                </Button>
              </div>
            </div>

            {/* Scrolls sideways rather than wrapping at 375px — three tabs with
                counts do not fit a phone width side by side. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-full overflow-x-auto">
                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList>
                    <TabsTrigger value="all">All staff ({detail.data.lines.length})</TabsTrigger>
                    {STAFF_CATEGORY_KEYS.map((key) => (
                      <TabsTrigger key={key} value={key}>
                        {STAFF_CATEGORY_LABEL[key]} ({countByCategory[key]})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => { if (v) setView(v as typeof view); }}
                variant="outline"
                size="sm"
                aria-label="Show"
              >
                <ToggleGroupItem value="register">Register</ToggleGroupItem>
                <ToggleGroupItem value="bank">Bank statement</ToggleGroupItem>
              </ToggleGroup>
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
                {/* All staff shows the run's FROZEN totals; a category tab
                    sums its own lines with the same definition the run uses
                    (registerFigures mirrors recomputeRunTotals), so Teaching +
                    Non-Teaching always add up to All staff. */}
                <div className="grid grid-cols-3 gap-x-6 gap-y-3 md:pr-10">
                  <Figure
                    label="On the roster"
                    value={String(tab === 'all' ? run.staff_total : tabFigures.staff)}
                    size="sm"
                  />
                  <Figure
                    label="Paid"
                    value={String(tab === 'all' ? run.included_count : tabFigures.paid)}
                    size="sm"
                  />
                  {(() => {
                    const excluded = tab === 'all' ? run.excluded_count : tabFigures.excluded;
                    return (
                      <Figure
                        label="Excluded"
                        value={String(excluded)}
                        size="sm"
                        tone={excluded > 0 ? 'warn' : 'muted'}
                      />
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-6 sm:grid-cols-3 md:border-l md:border-t-0 md:pl-10 md:pt-0">
                  <Figure label="Gross" value={inr(tab === 'all' ? run.total_gross : tabFigures.gross)} />
                  <Figure
                    label="Deductions"
                    value={inr(tab === 'all' ? run.total_deductions : tabFigures.deductions)}
                  />
                  <Figure
                    label={tab === 'all' ? 'Net payable' : `${STAFF_CATEGORY_LABEL[tab]} net payable`}
                    value={inr(tab === 'all' ? run.total_net : tabFigures.net)}
                    size="lg"
                  />
                </div>
              </CardContent>
            </Card>

            <SignoffPanel runId={run.id} isSuperseded={Boolean(run.superseded_at)} />
            {view === 'register' ? (
              /* Filters belong TO the table, so they share its surface instead
                 of floating above it as an unrelated toolbar. Keyed on the tab
                 so switching category remounts the table on page 1. */
              <section aria-label="Register lines" className="space-y-3">
                <RegisterFilters
                  lines={tabLines}
                  filters={filters}
                  onChange={setFilters}
                />
                <RegisterDataTable
                  key={tab}
                  lines={tabLines}
                  filters={filters}
                  canManage={canManage}
                  isSuperseded={Boolean(run.superseded_at)}
                  detailHref={detailHref}
                  onAdjust={setAdjustLine}
                />
              </section>
            ) : (
              <section aria-label="Bank statement" className="space-y-2">
                {tabFigures.missingAccounts > 0 && (
                  <p className="text-sm text-amber-700 dark:text-amber-500">
                    {tabFigures.missingAccounts} paid{' '}
                    {tabFigures.missingAccounts === 1 ? 'person has' : 'people have'} no bank account
                    recorded.
                  </p>
                )}
                <BankStatementTable lines={tabPaidLines} total={tabFigures.net} />
              </section>
            )}

            <DocumentDownloadDialog
              target={docTarget}
              onOpenChange={(open) => { if (!open) setDocTarget(null); }}
              runId={run.id}
              periodYear={run.period_year}
              periodMonth={run.period_month}
              lines={detail.data.lines}
              settings={docSettings.data?.settings}
              settingsSaved={docSettings.data?.saved === true}
              settingsLoading={docSettings.isLoading}
              canManage={canManage}
              onEditSettings={openSettingsFromDocument}
            />

            <DocumentSettingsDialog
              open={settingsOpen}
              onOpenChange={handleSettingsOpenChange}
              hrOrganizationId={run.hr_organization_id}
              organisationName={detail.data.organisation_name}
              settings={docSettings.data?.settings}
              saved={docSettings.data?.saved === true}
            />
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
