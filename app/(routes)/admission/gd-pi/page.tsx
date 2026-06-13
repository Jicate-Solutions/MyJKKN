'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { GDPIDataTable } from './_components/gdpi-data-table';

// 2026-05-11: tightened from generic 'admission.view' to 'admission.gd_pi.view'.
// The generic key is granted broadly (including via institution_scope='all'
// bypass for counselor roles), which meant /admission/gd-pi was accessible
// to admission_counselor / expo_counselor / learner_counselor / staff_counselor
// users even though GD-PI is an admin function. A dedicated permission key
// restricts it to roles explicitly granted that capability.
function GDPIPageContent() {
  return (
    <PermissionGuard module="admission" action="gd_pi.view">
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
