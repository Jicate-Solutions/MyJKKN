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
import { PublishersDataTable } from './_components/publishers-data-table';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/admission/marketing/database',
} as const;

function PublishersPageContent() {
  return (
    <PermissionGuard module="admission.marketing" action="view">
    <ContentLayout title="Publishers">
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
              <BreadcrumbPage>Publishers</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PublishersDataTable />
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}

export default function PublishersPage() {
  return (
    <AdmissionErrorBoundary>
      <PublishersPageContent />
    </AdmissionErrorBoundary>
  );
}
