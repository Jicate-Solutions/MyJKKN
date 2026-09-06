'use client';

/**
 * Per-job approvals workspace (2026-07-06).
 *
 * CVViZ-style: job header + Candidates / Job Details / Notes / Analytics tabs.
 * Tab state lives in ?tab= and each panel mounts only when active — Radix Tabs
 * eager-renders hidden panels, so we use a plain button tab bar instead.
 */

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  BarChart3, Briefcase, CalendarClock, FileText, ListChecks, MapPin, StickyNote, Tag, Users,
} from 'lucide-react';
import { useJob } from '@/hooks/hr/use-recruitment';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  JOB_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  type JobStatus,
} from '@/types/hr-recruitment';
import { WorkspaceCandidatesTab } from './_components/workspace-candidates-tab';
import { WorkspaceJobDetailsTab } from './_components/workspace-job-details-tab';
import { WorkspaceNotesTab } from './_components/workspace-notes-tab';
import { WorkspaceAnalyticsTab } from './_components/workspace-analytics-tab';
import { WorkspaceInterviewsTab } from './_components/workspace-interviews-tab';

export const navMeta = { invokedFrom: '/hr/recruitment/approvals' } as const;

type TabKey = 'candidates' | 'interviews' | 'details' | 'notes' | 'analytics';

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: 'candidates', label: 'Candidates', icon: ListChecks },
  { key: 'interviews', label: 'Interviews', icon: CalendarClock },
  { key: 'details', label: 'Job Details', icon: FileText },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  draft:   'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  open:    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  closed:  'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
  filled:  'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
};

export default function ApprovalsJobWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsJobWorkspaceInner />
    </Suspense>
  );
}

function ApprovalsJobWorkspaceInner() {
  const params = useParams();
  const jobId = params.jobId as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const tab: TabKey = (TABS.some((t) => t.key === rawTab) ? rawTab : 'candidates') as TabKey;

  const setTab = (next: TabKey) => {
    // ONE URLSearchParams update — parallel replace() calls clobber each other.
    const sp = new URLSearchParams(searchParams.toString());
    if (next === 'candidates') sp.delete('tab');
    else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(`/hr/recruitment/approvals/${jobId}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const { data: job, isLoading } = useJob(jobId);
  const { institutions } = useInstitutionsWithAccess();
  const institutionName = useMemo(
    () => institutions.find((i) => i.id === job?.institution_id)?.name,
    [institutions, job?.institution_id],
  );

  const location = [job?.city, job?.state].filter(Boolean).join(', ');

  return (
    <ContentLayout title={job?.title ?? 'Job Workspace'}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment/approvals">Approvals</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{job?.title ?? '…'}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {/* Job header */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-lg bg-muted/60 animate-pulse shrink-0" />
                <div className="space-y-2">
                  <div className="h-5 w-64 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-80 rounded bg-muted/40 animate-pulse" />
                </div>
              </div>
            ) : !job ? (
              <p className="text-sm text-muted-foreground">
                Job not found or you don&rsquo;t have access to it.
              </p>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold leading-tight text-foreground">{job.title}</h2>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${JOB_STATUS_BADGE[job.status]}`}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
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
                    <span className="tabular-nums">
                      {job.positions_filled}/{job.positions_open} positions filled
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tab bar */}
        <div className="border-b border-border">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Job workspace sections">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                    active
                      ? 'border-primary font-semibold text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panels — mounted only when active */}
        {tab === 'candidates' && <WorkspaceCandidatesTab jobId={jobId} />}
        {tab === 'interviews' && <WorkspaceInterviewsTab jobId={jobId} />}
        {tab === 'details' && <WorkspaceJobDetailsTab job={job ?? null} isLoading={isLoading} />}
        {tab === 'notes' && <WorkspaceNotesTab jobId={jobId} />}
        {tab === 'analytics' && <WorkspaceAnalyticsTab jobId={jobId} />}
      </div>
    </ContentLayout>
  );
}
