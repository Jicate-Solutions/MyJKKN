'use client';

// /admission/counselors/team/roster — Tab 2: 7-day schedule grid.

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
import { RosterTab } from '../_components/roster-tab';

function RosterPageContent() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Team — Roster">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/counselors/team">Team</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Roster</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-bold">Team Management</h1>
            <p className="text-muted-foreground mt-1">7-day availability schedule for each counselor.</p>
          </div>

          <TeamNav />

          <RosterTab institutionId={institutionId} isAdmin={isAdmin} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function RosterPage() {
  return (
    <AdmissionErrorBoundary>
      <RosterPageContent />
    </AdmissionErrorBoundary>
  );
}
