'use client';

/**
 * Per-project RAID register page — /projects/[id]/risks
 *
 * Two tabs: Risks | Issues. Risks carry severity (simple H/M/L or matrix),
 * mitigation steps (which can spawn linked tasks), and manual escalation.
 * Issues are already-materialized problems, optionally linked to a risk.
 *
 * Pattern: app/(routes)/projects/page.tsx (ContentLayout + Breadcrumb + Tabs).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3.
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
import { ShieldAlert, Bug, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useTabParam } from '@/hooks/use-tab-param';
import { RiskRegister } from '@/components/projects/risks/risk-register';
import { IssueRegister } from '@/components/projects/risks/issue-register';

type RaidTab = 'risks' | 'issues';

const RAID_TABS = ['risks', 'issues'] as const;

function ProjectRaidPageInner() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);
  const [tab, setTab] = useTabParam<RaidTab>('risks', RAID_TABS);

  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Risk & Issue register">
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
              <BreadcrumbPage>Risks &amp; Issues</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as RaidTab)}>
          <TabsList className={TAP_TARGET_TABS_LIST}>
            <TabsTrigger value="risks" className={`gap-1.5 ${TAP_TARGET}`}>
              <ShieldAlert className="h-4 w-4" />
              Risks
            </TabsTrigger>
            <TabsTrigger value="issues" className={`gap-1.5 ${TAP_TARGET}`}>
              <Bug className="h-4 w-4" />
              Issues
            </TabsTrigger>
          </TabsList>

          <TabsContent value="risks" className="mt-6">
            {projectId ? (
              <RiskRegister projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </TabsContent>
          <TabsContent value="issues" className="mt-6">
            {projectId ? (
              <IssueRegister projectId={projectId} />
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function ProjectRaidPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ProjectRaidPageInner />
    </Suspense>
  );
}
