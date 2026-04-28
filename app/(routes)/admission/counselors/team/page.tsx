'use client';

// /admission/counselors/team — Team Management hub, Members tab (default).
// Layout: ContentLayout + breadcrumb + TeamNav + tab content.
// Pattern mirrors /admission/counselors/page.tsx and /admission/counselors/briefing/page.tsx.

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
import { TeamNav } from './_components/team-nav';
import { MembersTab } from './_components/members-tab';

function TeamPageContent() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;

  // Super-admins see all institutions (pass undefined); others scoped to own institution.
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Team Management">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/counselors">Counselors</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Team</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Page header */}
          <div>
            <h1 className="text-2xl font-bold">Team Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage counselor roster, schedules, allocations, assignment rules and activity.
            </p>
          </div>

          {/* In-page tab nav (sidebar stays FLAT — tabs live here) */}
          <TeamNav />

          {/* Members tab content (default/index) */}
          <MembersTab institutionId={institutionId} isAdmin={isAdmin} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function TeamPage() {
  return (
    <AdmissionErrorBoundary>
      <TeamPageContent />
    </AdmissionErrorBoundary>
  );
}
