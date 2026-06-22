'use client';

import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsDeptScope } from '@/hooks/ims/use-ims-dept-scope';
import { InstitutionDashboard } from '@/components/ims/institution-dashboard';
import { DepartmentDashboard } from '@/components/ims/department-dashboard';

/**
 * IMS dashboard router.
 *
 * Department-scoped roles (e.g. lab_assistant with module_scopes.ims =
 * 'own_department') get a dashboard focused on THEIR department's requisitions
 * and consumption — not the institution-wide stock/sales view. Everyone else
 * gets the full institution dashboard. Scope is resolved by the same RLS helper
 * that filters the underlying rows, so the view and the data never disagree.
 */
export default function ImsDashboardPage() {
  const { data: scope, isLoading } = useImsDeptScope();

  if (isLoading) {
    return (
      <ContentLayout title="IMS Dashboard">
        <div className="flex items-center justify-center py-12">
          <BeatLoader color="#6366f1" size={12} />
        </div>
      </ContentLayout>
    );
  }

  // Scoped to a department (or scoped-but-no-department → DepartmentDashboard
  // renders the "no department assigned" fail-closed state).
  if (scope?.isScoped || scope?.scopedNoDept) {
    return <DepartmentDashboard departmentId={scope.departmentId} />;
  }

  return <InstitutionDashboard />;
}
