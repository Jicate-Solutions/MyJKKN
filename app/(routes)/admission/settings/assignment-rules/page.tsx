'use client';

// /admission/settings/assignment-rules — assignment rules CRUD scoped to the
// signed-in admin's institution. Director-grade UX via the policy-shell
// cascade primitive (PR #TBD, 2026-05-08). The team page at
// /admission/counselors/team/rules consumes the same shared component.

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
import { useAuth } from '@/hooks/use-auth';
import { AssignmentRulesCascade } from '@/components/shared/assignment-rules-crud';

function AssignmentRulesPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || undefined;

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="Assignment Rules">
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
                <BreadcrumbPage>Assignment Rules</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <AssignmentRulesCascade institutionId={institutionId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AssignmentRulesPage() {
  return (
    <AdmissionErrorBoundary>
      <AssignmentRulesPageContent />
    </AdmissionErrorBoundary>
  );
}
