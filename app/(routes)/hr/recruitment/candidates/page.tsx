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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  SORT_LABELS,
  buildPipelineRows,
  computeView,
  countAdvancedFilters,
  filtersFromParams,
  filtersToParams,
  summarize,
  toExportRows,
  type PipelineFilters,
  type SortKey,
} from './_lib/pipeline-model';
import { ActiveFilterChips, CandidatesFiltersPanel } from './_components/candidates-filters-panel';
import { CandidatesTable } from './_components/candidates-table';

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
      // Any change other than paging starts again from page 1.
      const next = { ...filters, ...patch, page: 'page' in patch ? patch.page! : 1 };
      const qs = filtersToParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
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

  const pages = Math.max(1, Math.ceil(view.filtered.length / filters.size));
  const page = Math.min(filters.page, pages);
  const pageRows = view.filtered.slice((page - 1) * filters.size, page * filters.size);

  const { data: alumni } = useAlumniSignalBulk(pageRows.map((r) => r.email));

  // Approvers get the job workspace link; everyone else the job page.
  const { hasAnyPermission: canApprove } = usePermissions(APPROVE_PERMISSION);

  const advancedCount = countAdvancedFilters(filters);

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (view.filtered.length === 0) return;
    setExporting(true);
    try {
      const aoa = [
        [...EXPORT_HEADERS],
        ...toExportRows(view.filtered, {
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
      toast.success(`Exported ${view.filtered.length} candidate${view.filtered.length === 1 ? '' : 's'}`);
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
            onClick={handleExport}
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
            <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as SortKey })}>
              <SelectTrigger className="w-full sm:w-[170px]" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <CandidatesTable
            rows={pageRows}
            total={view.filtered.length}
            page={page}
            size={filters.size}
            canApprove={canApprove}
            alumni={alumni}
            onPage={(p) => setFilters({ page: p })}
            onSize={(n) => setFilters({ size: n })}
          />
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
