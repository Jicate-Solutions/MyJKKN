'use client';

// ============================================================================
// Edit Industry Partner Page
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PartnerForm } from '../../../_components/partner-form';
import { useIndustryPartner } from '@/hooks/industry';
import { Building2 } from 'lucide-react';

export default function EditPartnerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: partner, isLoading } = useIndustryPartner(id);

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!partner) {
    return (
      <ContentLayout title="Partner Not Found">
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Partner not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/partners')}>
            Back to Partners
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="industry.partners" action="edit">
      <ContentLayout title={`Edit ${partner.company_name}`}>
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
                <BreadcrumbLink href={`/industry/partners/${id}`}>
                  {partner.company_name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Edit</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Edit Industry Partner</h2>
            <p className="text-muted-foreground">
              Update the details for {partner.company_name}
            </p>
          </div>

          {/* Form */}
          <PartnerForm partner={partner} mode="edit" />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
