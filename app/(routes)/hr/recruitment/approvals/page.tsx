'use client';

/**
 * Job-first Recruitment Approvals (2026-07-06 redesign).
 *
 * ATS-style overview: every job with its pipeline counts; clicking a job opens
 * the per-job workspace (/hr/recruitment/approvals/[jobId] — Candidates /
 * Job Details / Notes / Analytics tabs).
 *
 * URL contract preserved from the old flat inbox (sidebar + permission map):
 *   /hr/recruitment/approvals            → "Awaiting my action" (default)
 *   /hr/recruitment/approvals?view=all   → "All pending"
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle, Briefcase, ChevronDown, ChevronRight, Clock3, Inbox, MapPin,
  Search, SlidersHorizontal, Tag, Users,
} from 'lucide-react';
import { useApprovalsJobOverview, useCandidates } from '@/hooks/hr/use-recruitment';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';
import { MyPendingCandidates } from './_components/my-pending-candidates';
import {
  ApprovalsFiltersPanel,
  ActiveApprovalsFilterChips,
  EMPTY_APPROVALS_FILTERS,
  countActiveApprovalsFilters,
  approvalRowMatchesFilters,
  type ApprovalsAdvancedFilters,
} from './_components/approvals-filters-panel';
import {
  JOB_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  type ApprovalsJobOverviewRow,
  type CandidateStatus,
  type JobStatus,
} from '@/types/hr-recruitment';

type ViewMode = 'mine' | 'all';

const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  draft:   'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  open:    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  closed:  'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
  filled:  'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function RecruitmentApprovalsPage() {
  // useSearchParams (in the inner component) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <RecruitmentApprovalsInner />
    </Suspense>
  );
}

function RecruitmentApprovalsInner() {
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>(
    searchParams.get('view') === 'all' ? 'all' : 'mine'
  );
  const [search, setSearch] = useState('');
  const [advanced, setAdvanced] = useState<ApprovalsAdvancedFilters>(
    EMPTY_APPROVALS_FILTERS
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setViewMode(searchParams.get('view') === 'all' ? 'all' : 'mine');
  }, [searchParams]);

  const { data: rows, isLoading, error } = useApprovalsJobOverview();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { institutions } = useInstitutionsWithAccess();
  const institutionNameById = useMemo(
    () => new Map(institutions.map((i) => [i.id, i.name] as const)),
    [institutions],
  );

  // Legacy safety net: pending candidates that never came through a job.
  // Empty today (cleaned 2026-07-06) but renders a rescue card if any reappear.
  const { data: orphanData } = useCandidates({
    status: ['submitted', 'pending_approval'] as CandidateStatus[],
  });
  const orphans = (orphanData?.data ?? []).filter(
    (c) => !(c.role_specific_details as Record<string, unknown> | null)?.job_id,
  );

  // The 'all' view is job-first: every job, decision-first sorted (jobs needing
  // action float up). The 'mine' view renders candidate-level rows instead (see
  // MyPendingCandidates), so this job list only feeds 'all'.
  const visible = useMemo(() => {
    const all = rows ?? [];
    const q = search.trim().toLowerCase();
    const searched = q
      ? all.filter((r) =>
          r.job.title.toLowerCase().includes(q) ||
          (r.job.job_code ?? '').toLowerCase().includes(q) ||
          (institutionNameById.get(r.job.institution_id ?? '') ?? '').toLowerCase().includes(q))
      : all;
    const narrowed = searched.filter((r) => approvalRowMatchesFilters(r, advanced));
    return [...narrowed].sort((a, b) =>
      b.awaiting_me - a.awaiting_me ||
      b.in_approval - a.in_approval ||
      b.applications_pending - a.applications_pending ||
      new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime());
  }, [rows, search, institutionNameById, advanced]);

  const advancedCount = countActiveApprovalsFilters(advanced);
  // Stable identity for the panel's option-derivation memos.
  const allRows = useMemo(() => rows ?? [], [rows]);

  // Stat strip totals (whole dataset, not the filtered view — they answer
  // "how much is in the system", the list answers "what should I look at").
  const totals = useMemo(() => {
    const all = rows ?? [];
    return {
      jobs: all.length,
      applicants: all.reduce((n, r) => n + r.applications_total, 0),
      inApproval: all.reduce((n, r) => n + r.in_approval, 0),
      awaitingMe: all.reduce((n, r) => n + r.awaiting_me, 0),
    };
  }, [rows]);

  return (
    <ContentLayout title="Recruitment Approvals">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Approvals</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {/* Stat strip — CVViZ-style: value above, label below */}
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
              <StatTile label="All Jobs" value={totals.jobs} loading={isLoading} />
              <StatTile label="Total Applicants" value={totals.applicants} loading={isLoading} />
              <StatTile label="In Approval" value={totals.inApproval} loading={isLoading} />
              <StatTile
                label="Awaiting You"
                value={totals.awaitingMe}
                loading={isLoading}
                emphasis={totals.awaitingMe > 0}
              />
            </div>
          </CardContent>
        </Card>

        {/* Controls row: view toggle + search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex gap-1 border rounded-md p-1 w-fit bg-background">
            <button
              type="button"
              onClick={() => setViewMode('mine')}
              className={`px-3 py-1.5 rounded text-sm transition cursor-pointer ${
                viewMode === 'mine'
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Awaiting my action
              {totals.awaitingMe > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                  viewMode === 'mine' ? 'bg-background/20 text-background' : 'bg-primary/10 text-primary'
                }`}>
                  {totals.awaitingMe}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1.5 rounded text-sm transition cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All pending
            </button>
          </div>
          <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, code or institution…"
              className="pl-8 h-9"
              aria-label="Search jobs"
            />
          </div>

          {/* Advanced filters — job-first list only; the 'mine' view is
              candidate-level and none of these dimensions apply to it. */}
          {viewMode === 'all' && (
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Advanced Filters</span>
              {advancedCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-0.5 h-5 min-w-5 justify-center px-1 text-xs"
                >
                  {advancedCount}
                </Badge>
              )}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          )}
        </div>

        {viewMode === 'all' && (
          <>
            <ApprovalsFiltersPanel
              open={filtersOpen}
              rows={allRows}
              institutionNameById={institutionNameById}
              value={advanced}
              onChange={setAdvanced}
            />
            <ActiveApprovalsFilterChips
              value={advanced}
              institutionNameById={institutionNameById}
              onChange={setAdvanced}
            />
          </>
        )}

        {/* MINE — candidate-level list with inline approve/reject */}
        {viewMode === 'mine' && (
          <MyPendingCandidates userId={userId} search={search} />
        )}

        {/* ALL — job-first list */}
        {viewMode === 'all' && (
          <>
            {/* Fetch error */}
            {!isLoading && error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{(error as Error).message}</AlertDescription>
              </Alert>
            )}

            {/* Skeleton rows */}
            {isLoading && (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                      <div className="h-10 w-10 rounded-lg bg-muted/60 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-56 rounded bg-muted/60 animate-pulse" />
                        <div className="h-3 w-72 rounded bg-muted/40 animate-pulse" />
                      </div>
                      <div className="h-8 w-16 rounded bg-muted/40 animate-pulse" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {!isLoading && !error && visible.length === 0 && (
              <Card>
                <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium">No jobs found</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {search || advancedCount > 0
                      ? 'No job matches your search and filters.'
                      : 'Jobs appear here once created under Recruitment → Jobs.'}
                  </p>
                  {advancedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setAdvanced(EMPTY_APPROVALS_FILTERS)}
                      className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Clear advanced filters
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Job rows */}
            {!isLoading && !error && visible.length > 0 && (advancedCount > 0 || search) && (
              <p className="text-xs text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">{visible.length}</span>{' '}
                of {totals.jobs} job{totals.jobs !== 1 ? 's' : ''}
              </p>
            )}
            {!isLoading && !error && visible.length > 0 && (
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {visible.map((r) => (
                    <JobRow
                      key={r.job.id}
                      row={r}
                      institutionName={institutionNameById.get(r.job.institution_id ?? '')}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Legacy rescue card — pending candidates with no job link */}
        {orphans.length > 0 && (
          <Card className="border-amber-500/40">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Direct submissions not linked to a job ({orphans.length})
              </p>
              <p className="text-xs text-muted-foreground">
                These candidates entered the pipeline outside the job flow. Open each to act on it.
              </p>
              <div className="flex flex-wrap gap-2">
                {orphans.map((c) => (
                  <Link
                    key={c.id}
                    href={`/hr/recruitment/candidates/${c.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {c.name} — {c.role_title}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function StatTile({
  label, value, loading, emphasis,
}: { label: string; value: number; loading: boolean; emphasis?: boolean }) {
  return (
    <div className="px-4 py-3 sm:py-4">
      {loading ? (
        <div className="h-7 w-12 rounded bg-muted/60 animate-pulse" />
      ) : (
        <p className={`text-2xl font-semibold leading-none tabular-nums ${
          emphasis ? 'text-primary' : 'text-foreground'
        }`}>
          {value}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function JobRow({
  row, institutionName,
}: { row: ApprovalsJobOverviewRow; institutionName?: string }) {
  const { job } = row;
  const location = [job.city, job.state].filter(Boolean).join(', ');

  return (
    <Link
      href={`/hr/recruitment/approvals/${job.id}`}
      className="group flex items-center gap-3 p-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 outline-none"
    >
      {/* Icon tile */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Briefcase className="h-5 w-5" />
      </div>

      {/* Title + meta */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {job.title}
          </span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${JOB_STATUS_BADGE[job.status]}`}>
            {JOB_STATUS_LABELS[job.status]}
          </Badge>
          {row.awaiting_me > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground tabular-nums">
              {row.awaiting_me} awaiting you
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{ROLE_CATEGORY_LABELS[job.role_category]}</span>
          {institutionName && <span className="truncate">{institutionName}</span>}
          {location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
          {job.job_code && (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {job.job_code}
            </span>
          )}
        </div>
      </div>

      {/* Counts */}
      <div className="hidden sm:flex items-center gap-6 shrink-0">
        <CountCell icon={Users} value={row.applications_total} label="candidates" />
        <CountCell icon={Clock3} value={row.in_approval} label="in approval" emphasis={row.in_approval > 0} />
        <div className="hidden lg:block text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Created</p>
          <p className="text-xs text-foreground whitespace-nowrap">{fmtDate(job.created_at)}</p>
        </div>
      </div>

      {/* Mobile compact counts */}
      <div className="flex sm:hidden flex-col items-end gap-0.5 shrink-0 text-xs tabular-nums">
        <span className="font-semibold">{row.applications_total} <span className="font-normal text-muted-foreground">appl.</span></span>
        {row.in_approval > 0 && <span className="text-primary">{row.in_approval} in approval</span>}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
    </Link>
  );
}

function CountCell({
  icon: Icon, value, label, emphasis,
}: { icon: typeof Users; value: number; label: string; emphasis?: boolean }) {
  return (
    <div className="text-right min-w-[72px]">
      <p className={`inline-flex items-center gap-1 text-lg font-semibold leading-none tabular-nums ${
        emphasis ? 'text-primary' : value === 0 ? 'text-muted-foreground/50' : 'text-foreground'
      }`}>
        <Icon className="h-3.5 w-3.5" />
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
