'use client';

// ============================================================================
// Industry Partners - List Page
// Listing of all industry partners with filters and actions
// ============================================================================

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
import { PartnerTable } from '../_components/partner-table';

export default function PartnersPage() {
  return (
    <PermissionGuard module="industry.partners" action="view">
      <ContentLayout title="Industry Partners">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Partners</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Partner Table */}
          <PartnerTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
