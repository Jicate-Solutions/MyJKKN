'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserExpoTeamStatus } from '@/hooks/admission/use-expo-capture';
import { usePermissions } from '@/hooks/use-permissions';
import { ExposDataTable } from './_components/expos-data-table';

function ExposPageContent() {
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { data: isExpoTeamMember, isLoading: teamStatusLoading } = useUserExpoTeamStatus();

  // Allow access if user has permission OR is an assigned expo team member
  const hasPermission = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission.marketing.expos', 'view');
  const hasTeamAccess = isExpoTeamMember === true;

  if (teamStatusLoading) return null;

  if (!hasPermission && !hasTeamAccess) {
    return null;
  }

  return (
    <ContentLayout title="Expos">
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
              <BreadcrumbLink href="/admission/marketing/campaigns/monitoring">Marketing</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Expos</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <ExposDataTable isTeamMemberView={hasTeamAccess && !hasPermission} />
      </div>
    </ContentLayout>
  );
}

export default function ExposPage() {
  return (
    <AdmissionErrorBoundary>
      <ExposPageContent />
    </AdmissionErrorBoundary>
  );
}
