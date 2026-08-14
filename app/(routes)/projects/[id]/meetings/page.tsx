'use client';

/**
 * Per-project Meetings page — /projects/[id]/meetings
 *
 * Displays all meetings linked to the project:
 *   • List view (MeetingList) with expand to reveal SuggestedTasksPanel per row.
 *   • "Link meeting" button opens LinkMeetingDialog (manual metadata entry).
 *   • Confirming a suggested task creates a real project_task via TaskService.
 *
 * Actual Fireflies API fetch and AI action-item extraction are deferred.
 * See: TODO(fireflies-integration) in meeting-service.ts.
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F12.
 */

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
import { TAP_TARGET_BREADCRUMB } from '@/app/(routes)/projects/_lib/tap-targets';
import { Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { MeetingList } from '@/components/projects/meetings/meeting-list';

export default function ProjectMeetingsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);

  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Meetings">
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
              <BreadcrumbPage>Meetings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6">
        {projectId ? (
          <MeetingList projectId={projectId} />
        ) : (
          <p className="text-sm text-muted-foreground">No project selected.</p>
        )}
      </div>
    </ContentLayout>
  );
}
