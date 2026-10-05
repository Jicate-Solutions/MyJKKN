'use client';

/**
 * All Candidates — every person in recruitment, across every job the viewer
 * can see (hr.recruitment.view + institution access, enforced by RLS).
 *
 * Rows merge hr_job_applications with hr_recruitment_candidates exactly as the
 * per-job workspace Candidates tab does (see _lib/pipeline-model.ts). The whole
 * scope is loaded once and filtered in memory; every filter lives in the URL,
 * so a filtered view can be bookmarked or sent to someone.
 *
 * Read-only by design: rows link to the application / candidate detail and to
 * the job workspace, where screening and approval actions live.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle, CheckCircle2, Clock3, Download, Globe, Inbox, Loader2, Search,
  SlidersHorizontal, Sparkles, Users,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { useRecruitmentPipeline } from '@/hooks/hr/use-recruitment';
import { useAlumniSignalBulk } from '@/hooks/hr/use-alumni-signal-bulk';
import { usePermissions } from '@/hooks/use-permissions';
import XLSX from '@/lib/utils/excel-compat';
import {
  JOB_TYPE_LABELS,
  ROLE_CATEGORY_LABELS,
  type RoleCategory,
} from '@/types/hr-recruitment';
import { stageMeta, type StageKey } from '../approvals/[jobId]/_components/stage-model';
import {
  CHIP_ORDER,
  EXPORT_HEADERS,
  PAGE_SIZES,
  buildPipelineRows,
  computeView,
  countAdvancedFilters,
  filtersFromParams,
  filtersToParams,
  sortRows,
  summarize,
  toExportRows,
  type PipelineFilters,
  type PipelineRow,
} from './_lib/pipeline-model';
import { ActiveFilterChips, CandidatesFiltersPanel } from './_components/candidates-filters-panel';
import {
  CandidateMobileCard,
  INITIAL_COLUMN_VISIBILITY,
  getCandidateColumns,
} from './_components/candidates-columns';

const APPROVE_PERMISSION = ['hr.recruitment.approve'];

const CATEGORY_TABS: (RoleCategory | 'all')[] = [
  'all', 'teaching_faculty', 'non_teaching', 'medical', 'senior_leadership', 'contract',
];

export default function AllCandidatesPage() {
  // useSearchParams (in the inner component) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AllCandidatesInner />
    </Suspense>
  );
}

function AllCandidatesInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<PipelineFilters>) => {
      // The DataTable's own keys (page, pageSize, sortBy, …) are kept; its
      // pageResetKey below sends it back to page 1 when these filters change.
      const qs = filtersToParams({ ...filters, ...patch }, new URLSearchParams(searchParams.toString())).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router, searchParams],
  );

  // The search box is local so typing stays smooth; it reaches the URL after a pause.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch(filters.q), [filters.q]);
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => setFilters({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, filters.q, setFilters]);

  const [panelOpen, setPanelOpen] = useState(() => countAdvancedFilters(filters) > 0);

  const { data, isLoading, error } = useRecruitmentPipeline();
  const rows = useMemo(() => (data ? buildPipelineRows(data) : []), [data]);
  const view = useMemo(() => computeView(rows, filters), [rows, filters]);
  const summary = useMemo(() => summarize(view.filtered), [view.filtered]);

  // JKKN-history badges for the rows on screen; the table reports its page here.
  const [pageEmails, setPageEmails] = useState<string[]>([]);
  const { data: alumni } = useAlumniSignalBulk(pageEmails);

  // Approvers get the job workspace link; everyone else the job page.
  const { hasAnyPermission: canApprove } = usePermissions(APPROVE_PERMISSION);

  const advancedCount = countAdvancedFilters(filters);

  // The DataTable pages and sorts the already-filtered rows in memory.
  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const sorted = sortRows(view.filtered, params.sort_by, params.sort_order === 'asc' ? 'asc' : 'desc');
      const total = sorted.length;
      const totalPages = Math.max(1, Math.ceil(total / params.limit));
      const page = Math.min(Math.max(1, params.page), totalPages);
      const data = sorted.slice((page - 1) * params.limit, page * params.limit);
      setPageEmails(data.map((r) => r.email));
      return {
        success: true,
        data,
        pagination: { page, limit: params.limit, total_pages: totalPages, total_items: total },
      };
    },
    [view.filtered],
  );
  const fetchByIds = useCallback(
    async (ids: number[] | string[]) => {
      const wanted = new Set((ids as (string | number)[]).map(String));
      return rows.filter((r) => wanted.has(r.key));
    },
    [rows],
  );
  const fetchAll = useCallback(
    async (params: DataFetchParams) =>
      sortRows(view.filtered, params.sort_by, params.sort_order === 'asc' ? 'asc' : 'desc'),
    [view.filtered],
  );
  const getColumns = useCallback(
    () => getCandidateColumns({ canApprove, alumni }),
    [canApprove, alumni],
  );
  // Changes whenever the page's own filters change, so the table returns to page 1.
  const pageResetKey = useMemo(() => filtersToParams(filters).toString(), [filters]);

  const [exporting, setExporting] = useState(false);
  const handleExport = async (target: PipelineRow[]) => {
    if (target.length === 0) return;
    setExporting(true);
    try {
      const aoa = [
        [...EXPORT_HEADERS],
        ...toExportRows(target, {
          stage: (s) => stageMeta(s).label,
          category: (c) => ROLE_CATEGORY_LABELS[c] ?? c,
          jobType: (t) => JOB_TYPE_LABELS[t] ?? t,
        }),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
      ws['!freeze'] = { ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
      await XLSX.writeFile(wb, `recruitment-candidates-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exported ${target.length} candidate${target.length === 1 ? '' : 's'}`);
    } catch (e) {
      console.error('[all-candidates] export failed', e);
      toast.error('Could not build the Excel file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ContentLayout title="All Candidates">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>All Candidates</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">All Candidates</h1>
            <p className="text-sm text-muted-foreground">
              Everyone who applied or was submitted, across every job you can see.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => handleExport(view.filtered)}
            disabled={exporting || view.filtered.length === 0}
            className="w-full sm:w-auto"
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export to Excel
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Could not load candidates: {error instanceof Error ? error.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}

        {/* Summary — describes the current filtered view */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard icon={Users} label="Candidates" value={summary.total} loading={isLoading} />
          <SummaryCard icon={Sparkles} label="New this week" value={summary.newThisWeek} loading={isLoading} />
          <SummaryCard icon={Clock3} label="In approval" value={summary.inApproval} loading={isLoading} />
          <SummaryCard icon={CheckCircle2} label="Joined" value={summary.joined} loading={isLoading} />
          <SummaryCard icon={Globe} label="From careers site" value={`${summary.websiteShare}%`} loading={isLoading} />
        </div>

        {/* Job category tabs */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div role="tablist" aria-label="Job category" className="inline-flex min-w-full gap-1 rounded-lg bg-muted p-1 sm:min-w-0">
            {CATEGORY_TABS.map((c) => {
              const active = filters.category === c;
              const count = view.categoryCounts.get(c) ?? 0;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilters({ category: c })}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
                    active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c === 'all' ? 'All' : ROLE_CATEGORY_LABELS[c]}
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, qualification, company, job…"
              className="pl-9"
              aria-label="Search candidates"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={panelOpen ? 'secondary' : 'outline'}
              onClick={() => setPanelOpen((o) => !o)}
              className="shrink-0"
              aria-expanded={panelOpen}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
              {advancedCount > 0 && <Badge className="ml-2 h-5 px-1.5">{advancedCount}</Badge>}
            </Button>
          </div>
        </div>

        <CandidatesFiltersPanel open={panelOpen} rows={rows} value={filters} onChange={setFilters} />
        <ActiveFilterChips rows={rows} value={filters} onChange={setFilters} />

        {/* Stage chips */}
        <div className="flex flex-wrap gap-2">
          {CHIP_ORDER.map((s) => {
            const count = view.stageCounts.get(s) ?? 0;
            if (s !== 'all' && count === 0 && filters.stage !== s) return null;
            const active = filters.stage === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilters({ stage: s as StageKey | 'all' })}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {s === 'all' ? 'All stages' : stageMeta(s).label}
                <span className="tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : view.filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{rows.length === 0 ? 'No candidates yet' : 'No candidates match these filters'}</p>
              {rows.length > 0 && (
                <Button variant="link" onClick={() => router.replace(pathname, { scroll: false })}>
                  Clear all filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          // .pinned-actions-col (app/globals.css) keeps the last column — the
          // row ⋯ menu — stuck to the right edge while the wide table scrolls.
          <div className="pinned-actions-col">
          <DataTable<PipelineRow, unknown>
            fetchDataFn={fetchData}
            fetchByIdsFn={fetchByIds}
            fetchAllItemsFn={fetchAll}
            getColumns={getColumns}
            idField="key"
            pageSizeOptions={PAGE_SIZES}
            pageResetKey={pageResetKey}
            initialColumnVisibility={INITIAL_COLUMN_VISIBILITY}
            renderMobileRow={(r) => (
              <CandidateMobileCard
                row={r}
                canApprove={canApprove}
                alumni={alumni?.[r.email.toLowerCase().trim()] ?? null}
              />
            )}
            exportConfig={{ entityName: 'candidates', columnMapping: {}, columnWidths: [], headers: [] }}
            config={{
              enableUrlState: true,
              enableSearch: false,
              enableDateFilter: false,
              enableExport: false,
              enableRowSelection: true,
              enableColumnVisibility: true,
              enableColumnResizing: true,
              columnResizingTableId: 'hr-recruitment-all-candidates',
              // Honour each column's declared size and scroll horizontally,
              // instead of squeezing every column to fit the container.
              fixedColumnWidths: true,
            }}
            renderToolbarContent={({ selectedRows, totalSelectedCount, resetSelection }) =>
              totalSelectedCount > 0 ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting}
                    onClick={() => handleExport(selectedRows)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export selected ({totalSelectedCount})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetSelection}>Clear selection</Button>
                </div>
              ) : null
            }
          />
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

function SummaryCard({
  icon: Icon, label, value, loading,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          {loading ? <Skeleton className="mt-1 h-6 w-10" /> : <div className="text-xl font-semibold tabular-nums">{value}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
