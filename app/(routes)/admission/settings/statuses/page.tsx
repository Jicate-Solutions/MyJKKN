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
import { StatusesDataTable } from './_components/statuses-data-table';

function StatusesPageContent() {
  return (
    <PermissionGuard module="admission.settings.statuses" action="view">
      <ContentLayout title="Admission Statuses">
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
                <BreadcrumbPage>Statuses</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-semibold">Admission Statuses</h1>
            <p className="text-sm text-muted-foreground">
              Define lead funnel stages and learner lifecycle statuses. Configure the fee-paid threshold
              that gates the <code>account → active</code> transition and the dashboard&apos;s &quot;Seat Filled&quot; KPI.
            </p>
          </div>

          <StatusesDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionStatusesPage() {
  return (
    <AdmissionErrorBoundary>
      <StatusesPageContent />
    </AdmissionErrorBoundary>
  );
}
