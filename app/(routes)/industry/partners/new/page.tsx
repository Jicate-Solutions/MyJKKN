'use client';

// ============================================================================
// Create Industry Partner Page
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
import { PartnerForm } from '../../_components/partner-form';

export default function NewPartnerPage() {
  return (
    <PermissionGuard module="industry.partners" action="create">
      <ContentLayout title="Add Industry Partner">
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
                <BreadcrumbLink href="/industry/partners">Partners</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New Partner</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Add Industry Partner</h2>
            <p className="text-muted-foreground">
              Register a new industry partner for collaborations, mentorship, and placements
            </p>
          </div>

          {/* Form */}
          <PartnerForm mode="create" />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
