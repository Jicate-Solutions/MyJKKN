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
import { LeadsDataTable } from './_components/leads-data-table';

function AdmissionLeadsPageContent() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Leads">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">
                  Admission
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Leads</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <LeadsDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionLeadsPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionLeadsPageContent />
    </AdmissionErrorBoundary>
  );
}
