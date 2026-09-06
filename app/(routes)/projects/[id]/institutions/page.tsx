'use client';

/**
 * Cross-Institution page — /projects/[id]/institutions
 *
 * Manages the institutions participating in a project:
 *   - Displays the project's scope_model badge (read-only).
 *   - Lists all linked institutions with role badges and role-toggle / remove
 *     actions.
 *   - Opens AddInstitutionDialog to link a new institution.
 *   - Enforces single-lead constraint (via service; UI also disables the action
 *     button when a lead already exists).
 *
 * Pattern: app/(routes)/projects/[id]/risks/page.tsx
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F11.
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
import {
  TAP_TARGET,
  TAP_TARGET_BREADCRUMB,
} from '@/app/(routes)/projects/_lib/tap-targets';
import { Button } from '@/components/ui/button';
import { Loader2, Building2, Plus } from 'lucide-react';
import { useProject } from '@/hooks/projects/use-projects';
import { useProjectInstitutions } from '@/hooks/projects/use-project-institutions';
import { InstitutionList } from '@/components/projects/cross-institution/institution-list';
import { AddInstitutionDialog } from '@/components/projects/cross-institution/add-institution-dialog';
import { ScopeBadge } from '@/components/projects/cross-institution/scope-badge';

export default function ProjectInstitutionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: memberships } = useProjectInstitutions(projectId);

  const [addOpen, setAddOpen] = useState(false);

  const projectTitle = project?.title ?? 'Project';

  // IDs already linked — passed to dialog to exclude them from the picker.
  const existingIds = (memberships ?? []).map((m) => m.institution_id);

  // Used for guarding the "add lead" affordance in the dialog hint only.
  const hasLead = (memberships ?? []).some((m) => m.role === 'lead');

  return (
    <ContentLayout title="Institutions">
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
              <BreadcrumbPage>Institutions</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="mt-6 space-y-6">
        {/* Header row: scope badge + action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Scope:</span>
            <ScopeBadge scopeModel={project?.scope_model} />
          </div>

          <Button
            size="sm"
            className={`shrink-0 self-start sm:self-auto ${TAP_TARGET}`}
            onClick={() => setAddOpen(true)}
            disabled={!projectId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add institution
          </Button>
        </div>

        {/* Constraint hint */}
        {hasLead && (
          <p className="text-xs text-muted-foreground">
            This project already has a lead institution. To set a different
            lead, demote the current one first.
          </p>
        )}

        {/* Institution table */}
        {projectId ? (
          <InstitutionList projectId={projectId} />
        ) : (
          <p className="text-sm text-muted-foreground">No project selected.</p>
        )}
      </div>

      {/* Add institution dialog */}
      <AddInstitutionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        existingInstitutionIds={existingIds}
      />
    </ContentLayout>
  );
}
