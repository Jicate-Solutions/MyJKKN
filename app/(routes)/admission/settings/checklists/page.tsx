'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ChecklistsManager } from './_components/checklists-manager';

function ChecklistsPageContent() {
  return (
    <PermissionGuard module="admission.settings.checklists" action="view">
      <ContentLayout title="Programme Checklists">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/settings">Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Checklists</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-semibold">Programme Checklists</h1>
            <p className="text-sm text-muted-foreground">
              Define checklists at any level of the hierarchy — institution, degree, department, or
              programme. Items aggregate (union): a learner sees all items whose scope is an ancestor
              of their programme.
            </p>
          </div>

          <ChecklistsManager />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionChecklistsPage() {
  return (
    <AdmissionErrorBoundary>
      <ChecklistsPageContent />
    </AdmissionErrorBoundary>
  );
}
