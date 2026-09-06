'use client';

/**
 * Per-project Budget page — /projects/[id]/budget
 *
 * Two tabs: Lines | Change log.
 *
 * Lines tab: BudgetSummary (totals + burn) + BudgetTable (line-by-line with
 * planned / actual / forecast / variance, sortable by period_month).
 * Change log tab: BudgetChangesList — all recorded change requests for the
 * project, newest first.
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * (ContentLayout + Breadcrumb + Tabs + useProject for title).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  TAP_TARGET,
  TAP_TARGET_BREADCRUMB,
  TAP_TARGET_TABS_LIST,
} from '@/app/(routes)/projects/_lib/tap-targets';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, IndianRupee, GitBranch } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useTabParam } from '@/hooks/use-tab-param';
import { useBudgetLines, useBudgetChanges, useBudgetCategories } from '@/hooks/projects/use-budget';
import { BudgetSummary } from '@/components/projects/budget/budget-summary';
import { BudgetTable } from '@/components/projects/budget/budget-table';
import { BudgetChangesList } from '@/components/projects/budget/budget-changes-list';

type BudgetTab = 'lines' | 'changes';

const BUDGET_TABS = ['lines', 'changes'] as const;

function ProjectBudgetPageInner() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: lines = [], isLoading: linesLoading } = useBudgetLines(projectId);
  const { data: changes = [], isLoading: changesLoading } = useBudgetChanges(projectId);
  const { data: categories = [] } = useBudgetCategories();

  const [tab, setTab] = useTabParam<BudgetTab>('lines', BUDGET_TABS);

  const projectTitle = project?.title ?? 'Project';
  const isLoading = projectLoading || linesLoading;

  return (
    <ContentLayout title="Budget">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb className={TAP_TARGET_BREADCRUMB}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/projects/${projectId}`}>
                  {projectLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </span>
                  ) : (
                    projectTitle
                  )}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Budget</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6 space-y-6">
        {/* Summary cards — always visible, drive both tabs */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading budget…
          </div>
        ) : (
          <BudgetSummary lines={lines} />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as BudgetTab)}>
          <TabsList className={TAP_TARGET_TABS_LIST}>
            <TabsTrigger value="lines" className={`gap-1.5 ${TAP_TARGET}`}>
              <IndianRupee className="h-4 w-4" />
              Budget lines
            </TabsTrigger>
            <TabsTrigger value="changes" className={`gap-1.5 ${TAP_TARGET}`}>
              <GitBranch className="h-4 w-4" />
              Change log
              {changes.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {changes.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="mt-6">
            {projectId ? (
              <BudgetTable
                projectId={projectId}
                lines={lines}
                categories={categories}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </TabsContent>

          <TabsContent value="changes" className="mt-6">
            {changesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading change log…
              </div>
            ) : (
              <BudgetChangesList changes={changes} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function ProjectBudgetPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ProjectBudgetPageInner />
    </Suspense>
  );
}
