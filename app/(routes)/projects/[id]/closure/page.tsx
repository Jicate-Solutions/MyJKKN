'use client';

/**
 * Project Closure & Lessons Learned page — /projects/[id]/closure
 *
 * Two-section layout:
 *   1. PIR (Post-Implementation Review) — ClosureReportForm
 *   2. Lessons Learned — LessonsList with SuggestedLessonsPanel inline
 *
 * project.project_type_id is threaded into LessonsList so the suggestions
 * panel can surface lessons from other projects of the same type.
 *
 * Nav wiring (sidebar entry for /closure) is deferred to the orchestrator
 * integration PR (hard negative permission — we don't touch project [id] page
 * or layout).
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F15.
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
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useClosureReport } from '@/hooks/projects/use-closure';
import { ClosureReportForm } from '@/components/projects/closure/closure-report-form';
import { LessonsList } from '@/components/projects/closure/lessons-list';

export default function ProjectClosurePage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: report } = useClosureReport(projectId);

  const projectTitle = project?.title ?? 'Project';
  const projectTypeId = project?.project_type_id ?? null;

  return (
    <ContentLayout title="Closure & Lessons Learned">
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
              <BreadcrumbPage>Closure &amp; Lessons</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6 space-y-10">
        {/* Section 1: PIR closure report */}
        {projectId && <ClosureReportForm projectId={projectId} />}

        <Separator />

        {/* Section 2: Lessons learned */}
        {projectId && (
          <LessonsList
            projectId={projectId}
            closureReportId={report?.id ?? null}
            projectTypeId={projectTypeId}
          />
        )}
      </div>
    </ContentLayout>
  );
}
