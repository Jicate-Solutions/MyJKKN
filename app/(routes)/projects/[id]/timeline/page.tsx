/**
 * Per-project Gantt timeline route (Feature F2).
 *
 * Server component: resolves the project id from the dynamic segment and hands
 * it to the client TimelineView, which fetches tasks/phases/milestones/deps and
 * renders the Gantt. Kept separate from the `/projects` shell so it doesn't
 * collide with the shell's List/Board tab work.
 *
 * Pattern: app/(routes)/startup-studio/finance/grants/[id]/page.tsx
 *   (async server page → await params → render).
 */

import Link from 'next/link';
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
import { TimelineView } from '@/components/projects/timeline/timeline-view';

export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ContentLayout title="Project timeline">
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
            <BreadcrumbPage>Timeline</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <TimelineView projectId={id} />
      </div>
    </ContentLayout>
  );
}
