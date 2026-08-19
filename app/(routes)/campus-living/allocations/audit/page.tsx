'use client';

// Allocation Audit — read-only. Answers "was every allocated learner placed
// correctly?" against the two gates the auto-allocator applies: the fee band
// resolved from their admission-year academic bill, and the physical-room
// rules covering the room they actually occupy. No actions, by design.

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Loader2, Info, ShieldQuestion, ArrowLeft, FileDown, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

import {
  useAllocationAudit,
  useReaudit,
  allocationAuditKeys,
} from '@/hooks/campus-living/use-allocation-audit';
import type { AllocationAuditRow, AuditVerdict } from '@/types/campus-living-allocation-audit';
import {
  AllocationCascadeFilters,
  EMPTY_ALLOCATION_CASCADE,
  allocationMatchesCascade,
} from '../_components/allocation-filters';
import {
  getAuditColumns,
  toCascadeRow,
  auditToExportRow,
  AuditMobileCard,
  AUDIT_EXPORT_HEADERS,
  AUDIT_EXPORT_MAPPING,
  AUDIT_EXPORT_WIDTHS,
} from './_components/audit-columns';
import { AuditDetailDrawer } from './_components/audit-detail-drawer';
import { VERDICT_META } from './_components/audit-badges';
import {
  AuditAdvancedFilterPanel,
  EMPTY_AUDIT_FILTERS,
  auditMatchesFilters,
  auditFilterLabels,
} from './_components/audit-filters';

// Quick-filter buckets. Several verdicts collapse into one chip because the
// operator's question is "what do I need to look at", not "which of the eleven
// enum values is this".
const CHIPS: Array<{ key: string; label: string; match: (v: AuditVerdict) => boolean }> = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'correct', label: 'Correct', match: (v) => v === 'clean' || v === 'upgrade_paid' },
  {
    key: 'upgrade_due',
    label: 'Upgrade billed, not collected',
    match: (v) => v === 'upgrade_unpaid' || v === 'upgrade_partial',
  },
  {
    key: 'unexplained',
    label: 'Above band, unexplained',
    match: (v) => v === 'upgrade_unbilled' || v === 'upgrade_bill_cancelled',
  },
  { key: 'below', label: 'Below band', match: (v) => v === 'below_band' },
  {
    key: 'rule',
    label: 'Room rule violation',
    match: (v) => v === 'room_rule_violation' || v === 'band_and_rule_violation',
  },
  {
    key: 'unjudgeable',
    label: 'Not judgeable',
    match: (v) => v === 'no_band' || v === 'unranked',
  },
];

const STATUSES = [
  { value: 'active', label: 'Active allocations' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'vacated', label: 'Past allocations' },
  { value: 'all', label: 'All statuses' },
];

function AllocationAuditInner() {
  const [status, setStatus] = useState('active');
  const [cascade, setCascade] = useState(EMPTY_ALLOCATION_CASCADE);
  const [showFilters, setShowFilters] = useState(false);
  const [auditFilters, setAuditFilters] = useState(EMPTY_AUDIT_FILTERS);
  const [showAuditFilters, setShowAuditFilters] = useState(false);
  const [chip, setChip] = useState('all');
  const [detail, setDetail] = useState<AllocationAuditRow | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const {
    data: rows = [],
    isLoading,
    error,
    dataUpdatedAt,
  } = useAllocationAudit({ status });
  const { reaudit, isReauditing, queryClient } = useReaudit();

  // Pair each audit row with its cascade-shaped twin ONCE, so the shared
  // predicate can run over the same identity the filter panel derives its
  // options from. Rebuilding the adapter inside the predicate would allocate
  // 684 objects on every keystroke.
  const paired = useMemo(
    () => rows.map((r) => ({ row: r, cascade: toCascadeRow(r) })),
    [rows]
  );
  const cascadeRows = useMemo(() => paired.map((p) => p.cascade), [paired]);

  // Rows passing the Advanced Filters — the KPI cards read this, so the cards
  // and the table always describe the same population. Computed from the one
  // fetched payload rather than a second summary call, which on a live DB can
  // legitimately disagree with the list it sits above.
  // Rows passing the CASCADE only. The audit panel derives its dropdown options
  // from these rather than from `scoped`: deriving from the fully-filtered set
  // would make every other dropdown collapse to the one value still standing
  // the moment you picked a verdict.
  const cascadeScopedRows = useMemo(
    () => paired.filter((p) => allocationMatchesCascade(p.cascade, cascade)).map((p) => p.row),
    [paired, cascade]
  );

  // Both panels compose with AND, and both feed `scoped` — so the KPI cards and
  // the chip counts describe exactly the slice on screen. Filter to the 2024
  // cohort and "Correct" tells you how that cohort did, not how everyone did.
  const scoped = useMemo(
    () => cascadeScopedRows.filter((r) => auditMatchesFilters(r, auditFilters)),
    [cascadeScopedRows, auditFilters]
  );

  const kpi = useMemo(() => {
    const by = (f: (v: AuditVerdict) => boolean) => scoped.filter((r) => f(r.verdict)).length;
    return {
      total: scoped.length,
      correct: by((v) => v === 'clean' || v === 'upgrade_paid'),
      upgradeDue: by((v) => v === 'upgrade_unpaid' || v === 'upgrade_partial'),
      unexplained: by((v) => v === 'upgrade_unbilled' || v === 'upgrade_bill_cancelled'),
      below: by((v) => v === 'below_band'),
      ruleViolation: by((v) => v === 'room_rule_violation' || v === 'band_and_rule_violation'),
      yearFallback: scoped.filter((r) => r.band_year_source !== 'admission_year').length,
    };
  }, [scoped]);

  const filterRows = useCallback(
    (search: string) => {
      const chipDef = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];
      const q = (search ?? '').trim().toLowerCase();
      return scoped.filter((r) => {
        if (!chipDef.match(r.verdict)) return false;
        if (q) {
          const hay = [
            r.full_name,
            r.roll_number,
            r.email,
            r.block_name,
            r.room_number,
            r.program_name,
            r.institution_name,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },
    [scoped, chip]
  );

  const fetchAllItems = useCallback(
    async (params: { search: string }) => filterRows(params.search ?? ''),
    [filterRows]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      let list = filterRows(params.search ?? '');

      if (params.sort_by) {
        const val = (r: AllocationAuditRow): string => {
          switch (params.sort_by) {
            case 'learner':
              return r.full_name ?? '';
            case 'admitted':
              return String(r.admission_year ?? '');
            case 'verdict':
              return VERDICT_META[r.verdict]?.label ?? r.verdict;
            default:
              return '';
          }
        };
        const dir = params.sort_order === 'desc' ? -1 : 1;
        list = [...list].sort((a, b) => val(a).localeCompare(val(b)) * dir);
      }

      const limit = params.limit || 25;
      const total = list.length;
      const start = (params.page - 1) * limit;
      return {
        success: true,
        data: list.slice(start, start + limit),
        pagination: {
          page: params.page,
          limit,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          total_items: total,
        },
      };
    },
    [filterRows]
  );

  const exportConfig = useMemo(
    () => ({
      entityName: 'hostel-allocation-audit',
      headers: AUDIT_EXPORT_HEADERS,
      columnMapping: AUDIT_EXPORT_MAPPING,
      columnWidths: AUDIT_EXPORT_WIDTHS,
      transformFunction: auditToExportRow,
    }),
    []
  );

  const columns = useMemo(() => getAuditColumns(setDetail), []);

  // Active filters in words, for the PDF's scope block. The id-keyed filters
  // are resolved back to names off the loaded rows — the panel stores ids, and
  // a report that stamped a raw uuid as its scope would be unreadable.
  const filterLabels = useMemo(() => {
    const out: string[] = [];
    if (cascade.hostelType !== 'all') out.push(`Type: ${cascade.hostelType}`);
    if (cascade.gender !== 'all') out.push(`Gender: ${cascade.gender}`);
    if (cascade.block !== 'all') out.push(`Block: ${cascade.block}`);
    if (cascade.floor !== 'all')
      out.push(`Floor: ${cascade.floor === '0' ? 'Ground' : cascade.floor}`);
    const a = cascade.advanced;
    if (a.institution_id)
      out.push(
        `Institution: ${rows.find((r) => r.institution_id === a.institution_id)?.institution_name ?? a.institution_id}`
      );
    if (a.program_id)
      out.push(
        `Program: ${rows.find((r) => r.program_id === a.program_id)?.program_name ?? a.program_id}`
      );
    if (a.semester_id)
      out.push(
        `Semester: ${rows.find((r) => r.semester_id === a.semester_id)?.semester_name ?? a.semester_id}`
      );
    // Room and mess category filters already hold NAMES, not ids — the panel
    // dedupes them by name because categories are institution-scoped.
    if (a.room_category_id) out.push(`Room category: ${a.room_category_id}`);
    if (a.mess_category_id) out.push(`Mess category: ${a.mess_category_id}`);
    if (a.room_id)
      out.push(`Room: ${rows.find((r) => r.room_id === a.room_id)?.room_number ?? a.room_id}`);
    // The audit panel narrows the report too, so its selections must appear in
    // the PDF's scope block — otherwise the export understates what it excluded.
    out.push(...auditFilterLabels(auditFilters));
    return out;
  }, [cascade, rows, auditFilters]);

  // Re-run against current config and report what MOVED. The whole reason to
  // press this is "I changed a fee band / a room rule / a bill — did it help?",
  // and a silent refresh of a 684-row table answers that only if you had
  // memorised the old numbers.
  //
  // The delta is read out of the query cache rather than from `rows`: awaiting
  // the invalidation resolves when the refetch settles, but this closure still
  // holds the pre-refetch render's `rows`.
  const handleReaudit = useCallback(async () => {
    const score = (rs: AllocationAuditRow[]) => ({
      total: rs.length,
      correct: rs.filter((r) => r.verdict === 'clean' || r.verdict === 'upgrade_paid').length,
    });
    const before = score(rows);
    await reaudit();
    const fresh =
      (queryClient.getQueryData(allocationAuditKeys.list({ status })) as
        | AllocationAuditRow[]
        | undefined) ?? [];
    const after = score(fresh);

    const dCorrect = after.correct - before.correct;
    const dTotal = after.total - before.total;
    if (dCorrect === 0 && dTotal === 0) {
      toast.success(`Re-audited ${after.total} allocations — no change.`);
    } else {
      const bits: string[] = [];
      if (dCorrect !== 0)
        bits.push(
          `Correct ${before.correct} → ${after.correct} (${dCorrect > 0 ? '+' : ''}${dCorrect})`
        );
      if (dTotal !== 0)
        bits.push(`Audited ${before.total} → ${after.total} (${dTotal > 0 ? '+' : ''}${dTotal})`);
      toast.success(`Re-audited — ${bits.join(' · ')}`);
    }
  }, [rows, reaudit, queryClient, status]);

  // Exports what is on screen: advanced filters + the verdict chip, minus the
  // table's own search box (transient, and not represented in the scope block).
  const downloadPdf = useCallback(async () => {
    setPdfBusy(true);
    try {
      const { exportAuditPdf } = await import('./_components/audit-report-pdf');
      exportAuditPdf(filterRows(''), {
        statusLabel: STATUSES.find((s) => s.value === status)?.label ?? status,
        filters: filterLabels,
        chipLabel: CHIPS.find((c) => c.key === chip)?.label ?? 'All',
        totalAudited: rows.length,
        dataAsOf: dataUpdatedAt,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to build the PDF report');
    } finally {
      setPdfBusy(false);
    }
  }, [filterRows, filterLabels, status, chip, rows.length, dataUpdatedAt]);

  const renderMobileRow = useCallback(
    (r: AllocationAuditRow) => <AuditMobileCard row={r} onView={setDetail} />,
    []
  );

  return (
    <ContentLayout title="Allocation Audit">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Audit' },
        ]}
      />

      <div className="mt-4 space-y-6">
        {/* Header. Breaks to a column below xl rather than sm: the prose block
            plus three actions needs ~1100px to sit on one line, and forcing the
            row at sm squeezed the actions into a ragged 2-then-1 wrap with the
            back link orphaned on its own row. */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 py-1 text-2xl font-bold">
              <ShieldQuestion className="h-6 w-6" /> Allocation Audit
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Every allocated learner checked against the two gates the auto-allocator
              applies: the <strong>fee band</strong> resolved from the academic bill of the
              year they were admitted in, and the <strong>physical-room rules</strong> covering
              the room they occupy. A category above the band is legitimate when an upgrade
              bill explains it — so above-band rows are split by whether that bill exists and
              whether it has been collected.
            </p>
          </div>
          {/* `flex-1 sm:flex-none` = each action stretches to share the row on
              phones (two up, then one), and takes its natural width from sm up.
              `xl:shrink-0` stops the prose block from compressing them once the
              header goes back to a single row. */}
          <div className="flex w-full flex-wrap gap-2 xl:w-auto xl:shrink-0 xl:justify-end">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={handleReaudit}
              disabled={isReauditing || isLoading}
              title="Re-run every check against the current fee bands, room rules and bills"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isReauditing ? 'animate-spin' : ''}`}
              />
              {isReauditing ? 'Re-auditing…' : 'Re-audit'}
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              onClick={downloadPdf}
              disabled={pdfBusy || isLoading || rows.length === 0}
            >
              {pdfBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              {/* The icon already says "download", so drop the verb on narrow
                  screens where this button is the widest of the three. */}
              <span className="hidden sm:inline">Download&nbsp;</span>PDF report
            </Button>
            <Button variant="outline" className="flex-1 sm:flex-none" asChild>
              <Link href="/campus-living/allocations">
                <ArrowLeft className="mr-2 h-4 w-4" /> Allocations
              </Link>
            </Button>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This page is read-only — it reports, it does not repair. Fixes go through
            Allocations, Category Upgrades or the Category-Eligibility settings.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to load the audit.'}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={setStatus}>
            {/* Fixed 220px only from sm — on a phone it must fill the row. */}
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLoading || isReauditing ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Auditing…
            </span>
          ) : (
            dataUpdatedAt > 0 && (
              <span className="min-w-0 max-w-full break-words text-xs text-muted-foreground">
                Last audited {format(new Date(dataUpdatedAt), 'dd MMM yyyy, HH:mm:ss')} — verdicts
                are computed live from the current fee bands, room rules and bills, so change any
                of those and press Re-audit.
              </span>
            )
          )}
        </div>

        {/* Six across only from xl. At lg each card got ~200px, which clipped
            the longest labels ("Band year ≠ admission year" + its hint); 3 × 2
            rows reads better at that width than one squeezed row. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi value={kpi.total} label="Audited" />
          <Kpi value={kpi.correct} label="Correct" tone="green" />
          <Kpi
            value={kpi.upgradeDue}
            label="Upgrade billed, unpaid"
            tone="amber"
            hint="Above band; bill raised, not collected"
          />
          <Kpi
            value={kpi.unexplained}
            label="Above band, unexplained"
            tone="red"
            hint="No live upgrade bill at all"
          />
          <Kpi value={kpi.ruleViolation} label="Room rule violation" tone="red" />
          <Kpi
            value={kpi.yearFallback}
            label="Band year ≠ admission year"
            tone="amber"
            hint="Band read from a different academic year"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const n = scoped.filter((r) => c.match(r.verdict)).length;
            return (
              <Button
                key={c.key}
                variant={chip === c.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setChip(c.key)}
              >
                {c.label}
                <Badge variant="secondary" className="ml-2 text-xs">
                  {n}
                </Badge>
              </Button>
            );
          })}
        </div>

        {/* The Allocations module's own Advanced Filters, imported verbatim — one
            predicate, so the two screens can never describe different sets. */}
        <AllocationCascadeFilters
          rows={cascadeRows}
          value={cascade}
          onChange={setCascade}
          open={showFilters}
          onOpenChange={setShowFilters}
        />

        {/* Audit-only dimensions. Options derive from the rows currently in
            scope, so the two panels narrow each other rather than offering
            values that would return nothing. */}
        <AuditAdvancedFilterPanel
          rows={cascadeScopedRows}
          value={auditFilters}
          onChange={setAuditFilters}
          open={showAuditFilters}
          onOpenChange={setShowAuditFilters}
        />

        {/* audit-wide-table gives the table an explicit min-width so the
            container's overflow-x-auto actually engages — <Table> is w-full, so
            without it the 11 columns squeeze below their declared sizes and
            clip mid-word rather than scrolling. It also pins the Learner
            column; pinned-actions-col pins the actions. Below md the DataTable
            swaps in renderMobileRow and neither applies. */}
        <div className="pinned-actions-col audit-wide-table">
          <DataTable
            fetchDataFn={fetchData}
            fetchAllItemsFn={fetchAllItems}
            getColumns={() => columns}
            renderMobileRow={renderMobileRow as never}
            idField="allocation_id"
            exportConfig={exportConfig}
            config={{
              // Off deliberately: this route already carries the Allocations
              // page's sibling tables in the same module, and inheriting a
              // `page` from elsewhere would open an audit list on an empty
              // page — which reads as "no problems".
              enableUrlState: false,
              enableDateFilter: false,
              enableExport: true,
              enableRowSelection: false,
            }}
          />
        </div>
      </div>

      <AuditDetailDrawer row={detail} onClose={() => setDetail(null)} />
    </ContentLayout>
  );
}

function Kpi({
  value,
  label,
  tone,
  hint,
}: {
  value: number;
  label: string;
  tone?: 'green' | 'amber' | 'red';
  hint?: string;
}) {
  const toneClass =
    tone === 'green'
      ? 'text-green-600'
      : tone === 'amber'
        ? 'text-amber-600'
        : tone === 'red'
          ? 'text-red-600'
          : '';
  return (
    <Card className="min-w-0">
      {/* break-words, not truncate: an audit KPI whose label is cut off ("Band
          year ≠ admission…") is worse than one that wraps to a second line. */}
      <CardContent className="min-w-0 p-4">
        <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
        <p className="break-words text-xs text-muted-foreground">{label}</p>
        {hint && (
          <p className="break-words text-[11px] leading-tight text-muted-foreground/70">
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AllocationAuditPage() {
  return (
    <PermissionGuard
      module="campus_living.allocations"
      action="audit"
      loading={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
      fallback={
        <ContentLayout title="Allocation Audit">
          <Alert className="mt-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
              The Allocation Audit is restricted. Ask a super admin to grant
              <code className="mx-1">campus_living.allocations.audit</code> if you need it.
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      {/* DataTable reads useSearchParams internally. */}
      <Suspense fallback={null}>
        <AllocationAuditInner />
      </Suspense>
    </PermissionGuard>
  );
}
