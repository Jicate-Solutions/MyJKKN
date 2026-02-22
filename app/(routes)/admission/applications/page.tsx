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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { ApplicationsDataTable } from './_components/applications-data-table';

function AdmissionApplicationsPageContent() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Applications">
        <div className="space-y-6">
          {/* Breadcrumb */}
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
                <BreadcrumbPage>Applications</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* DataTable */}
          <ApplicationsDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionApplicationsPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionApplicationsPageContent />
    </AdmissionErrorBoundary>
  );
}
