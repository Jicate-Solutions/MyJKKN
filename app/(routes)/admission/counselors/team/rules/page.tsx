'use client';

// /admission/counselors/team/rules — Tab 4: Read-only assignment rules display.
// Edit/CRUD lives at /admission/settings/assignment-rules.

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { TeamNav } from '../_components/team-nav';
import { RulesTab } from '../_components/rules-tab';

function RulesPageContent() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Team — Rules">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/counselors/team">Team</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Rules</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-bold">Team Management</h1>
            <p className="text-muted-foreground mt-1">
              Assignment rules that govern automatic lead routing to counselors.
            </p>
          </div>

          <TeamNav />

          <RulesTab institutionId={institutionId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function RulesPage() {
  return (
    <AdmissionErrorBoundary>
      <RulesPageContent />
    </AdmissionErrorBoundary>
  );
}
