'use client';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AssignmentRulesDataTable } from './_components/assignment-rules-data-table';

function AssignmentRulesPageContent() {
  return (
    <PermissionGuard module="admission.settings" action="view">
    <ContentLayout title="Assignment Rules">
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
              <BreadcrumbPage>Assignment Rules</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <AssignmentRulesDataTable />
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}

export default function AssignmentRulesPage() {
  return (
    <AdmissionErrorBoundary>
      <AssignmentRulesPageContent />
    </AdmissionErrorBoundary>
  );
}
