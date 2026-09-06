'use client';

/**
 * Projects — Templates Gallery (F10)
 *
 * Top-level route at /projects/templates. Shows a searchable, filterable card
 * grid of active project_templates. Each card has a "Use template" CTA (opens
 * CreateFromTemplateDialog) and a delete action. A "Save as template" button
 * opens SaveAsTemplateDialog (self-contained with project picker).
 *
 * The "Save as template" entry point can also be wired to individual project
 * detail pages by the orchestrator integration PR; that detail-page button
 * passes projectId directly to SaveAsTemplateDialog.
 *
 * Pattern: app/(routes)/projects/portfolio/page.tsx
 * (ContentLayout + Breadcrumb Projects→[section]).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F10.
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
import { TemplateGallery } from '@/components/projects/templates/template-gallery';

export default function ProjectTemplatesPage() {
  return (
    <ContentLayout title="Project Templates">
      {/* Header */}
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
              <BreadcrumbPage>Templates</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Gallery */}
      <div className="mt-6">
        <TemplateGallery />
      </div>
    </ContentLayout>
  );
}
