'use client';

/**
 * Per-project Resource & Capacity Planning page — /projects/[id]/resources
 *
 * Shows per-member allocation vs assigned task hours, flags over-allocation,
 * and surfaces hr_faculty_workload context (graceful skip if unavailable).
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F5.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProject } from '@/hooks/projects/use-projects';
import { useMemberCapacity } from '@/hooks/projects/use-resources';
import { CapacitySummary } from '@/components/projects/resources/capacity-summary';
import { ResourceTable } from '@/components/projects/resources/resource-table';

export default function ProjectResourcesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const {
    data: capacityItems,
    isLoading: capacityLoading,
    error: capacityError,
  } = useMemberCapacity(projectId);

  const projectTitle = project?.title ?? 'Project';
  const isLoading = projectLoading || capacityLoading;

  return (
    <ContentLayout title="Resource &amp; Capacity">
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
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading&hellip;
                    </span>
                  ) : (
                    projectTitle
                  )}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Resources</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6 space-y-6">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Resource &amp; Capacity Planning</h2>
        </div>

        {/* Error state */}
        {capacityError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load capacity data:{' '}
              {capacityError instanceof Error ? capacityError.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading */}
        {isLoading && !capacityError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading capacity data&hellip;
          </div>
        )}

        {/* Content */}
        {!isLoading && !capacityError && capacityItems && (
          <>
            <CapacitySummary items={capacityItems} />
            <ResourceTable items={capacityItems} />

            {/* Cross-module note */}
            <p className="text-xs text-muted-foreground">
              Capacity = allocation_percentage × 40h standard week.
              {capacityItems.some((i) => i.facultyWeeklyHours != null)
                ? ' Faculty weekly hours sourced from hr_faculty_workload (contact + admin + research).'
                : ' Faculty weekly hours unavailable — hr_faculty_workload returned no matching rows.'}
            </p>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
