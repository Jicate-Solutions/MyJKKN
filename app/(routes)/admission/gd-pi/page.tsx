'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { GDPIDataTable } from './_components/gdpi-data-table';

function GDPIPageContent() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="GD-PI Management">
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
                <BreadcrumbPage>GD-PI</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <GDPIDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function GDPIPage() {
  return (
    <AdmissionErrorBoundary>
      <GDPIPageContent />
    </AdmissionErrorBoundary>
  );
}
