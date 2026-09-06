'use client';

/**
 * Stakeholder Communication page — /projects/[id]/stakeholders
 *
 * Two tabs:
 *   Stakeholders — CRUD list of project_stakeholders (internal staff or
 *                  external persons with role + notification prefs).
 *   Status Reports — list of project_status_reports + new manual report.
 *
 * Navigation to this page is wired by the orchestrator integration PR.
 * Actor fields (created_by) are currently null at this layer — see PR.
 *
 * IMPORTANT: Notification SENDING (email dispatch, in-app push) is intentionally
 * NOT implemented. This page stores stakeholder preferences and report rows only.
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
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
import { Users, FileText, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useTabParam } from '@/hooks/use-tab-param';
import { StakeholderList } from '@/components/projects/stakeholders/stakeholder-list';
import { StatusReportList } from '@/components/projects/stakeholders/status-report-list';

type StakeholderTab = 'stakeholders' | 'status-reports';

const STAKEHOLDER_TABS = ['stakeholders', 'status-reports'] as const;

function ProjectStakeholdersPageInner() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);
  const [tab, setTab] = useTabParam<StakeholderTab>('stakeholders', STAKEHOLDER_TABS);

  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Stakeholder Communication">
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
                  {isLoading ? (
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
              <BreadcrumbPage>Stakeholders</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as StakeholderTab)}
        >
          <TabsList className={TAP_TARGET_TABS_LIST}>
            <TabsTrigger value="stakeholders" className={`gap-1.5 ${TAP_TARGET}`}>
              <Users className="h-4 w-4" />
              Stakeholders
            </TabsTrigger>
            <TabsTrigger value="status-reports" className={`gap-1.5 ${TAP_TARGET}`}>
              <FileText className="h-4 w-4" />
              Status Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stakeholders" className="mt-6">
            {projectId ? (
              <StakeholderList projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No project selected.
              </p>
            )}
          </TabsContent>

          <TabsContent value="status-reports" className="mt-6">
            {projectId ? (
              <StatusReportList projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No project selected.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function ProjectStakeholdersPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ProjectStakeholdersPageInner />
    </Suspense>
  );
}
