'use client';

/**
 * Per-project Approvals page — /projects/[id]/approvals
 *
 * Two tabs:
 *   Requests — list of project_approval_requests with act/reject controls
 *   Workflows — CRUD for project_approval_workflows (global config, scoped to page)
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 *   (ContentLayout + Breadcrumb + Tabs + lazy-loaded sub-components).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 *
 * NOTE: Nav wiring (sidebar / detail-page tab) is handled by the orchestrator
 *       integration PR, NOT here.
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
import { CheckCircle2, GitBranch, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useTabParam } from '@/hooks/use-tab-param';
import { ApprovalRequestList } from '@/components/projects/approvals/approval-request-list';
import { WorkflowConfigTable } from '@/components/projects/approvals/workflow-config-table';

type ApprovalsTab = 'requests' | 'workflows';

const APPROVALS_TABS = ['requests', 'workflows'] as const;

function ProjectApprovalsPageInner() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);
  const [tab, setTab] = useTabParam<ApprovalsTab>('requests', APPROVALS_TABS);

  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Approval Workflows">
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
              <BreadcrumbPage>Approvals</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ApprovalsTab)}>
          <TabsList className={TAP_TARGET_TABS_LIST}>
            <TabsTrigger value="requests" className={`gap-1.5 ${TAP_TARGET}`}>
              <CheckCircle2 className="h-4 w-4" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="workflows" className={`gap-1.5 ${TAP_TARGET}`}>
              <GitBranch className="h-4 w-4" />
              Workflow config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="mt-6">
            {projectId ? (
              <ApprovalRequestList projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </TabsContent>

          <TabsContent value="workflows" className="mt-6">
            <WorkflowConfigTable />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function ProjectApprovalsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ProjectApprovalsPageInner />
    </Suspense>
  );
}
