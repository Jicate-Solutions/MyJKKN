'use client';

/**
 * Change Management page — /projects/[id]/changes
 *
 * Lists change requests for the project; supports create, approve/reject,
 * and delete. Major vs minor changes are visually distinguished.
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
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
import { ChangeRequestList } from '@/components/projects/changes/change-request-list';

export default function ProjectChangesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading } = useProject(projectId);
  const projectTitle = project?.title ?? 'Project';

  return (
    <ContentLayout title="Change Management">
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
              <BreadcrumbPage>Change Management</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6">
        {projectId ? (
          <ChangeRequestList projectId={projectId} />
        ) : (
          <p className="text-sm text-muted-foreground">No project selected.</p>
        )}
      </div>
    </ContentLayout>
  );
}
