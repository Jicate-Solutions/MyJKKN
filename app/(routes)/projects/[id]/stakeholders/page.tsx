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

import { useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, FileText, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { StakeholderList } from '@/components/projects/stakeholders/stakeholder-list';
import { StatusReportList } from '@/components/projects/stakeholders/status-report-list';

type StakeholderTab = 'stakeholders' | 'status-reports';

export default function ProjectStakeholdersPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);
  const [tab, setTab] = useState<StakeholderTab>('stakeholders');

  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Stakeholder Communication">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb>
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
          <TabsList>
            <TabsTrigger value="stakeholders" className="gap-1.5">
              <Users className="h-4 w-4" />
              Stakeholders
            </TabsTrigger>
            <TabsTrigger value="status-reports" className="gap-1.5">
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
