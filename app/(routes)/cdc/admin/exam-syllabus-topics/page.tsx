import { MasterTablePage } from '../_components/master-table-page';
import { PermissionGuard } from '@/components/auth/permission-guard';

// CDC govt-job-readiness (PR-4 / Option B): CRUD for the shared-vs-domain
// government-exam syllabus topics. is_shared marks a topic as part of the
// cross-exam common syllabus — it drives the data-driven overlap computed on
// the /cdc/govt-readiness cohort-overlap view. Reuses the generic master UI.
//
// Defense-in-depth: the /cdc/admin RoutePermissionGuard already gates this route
// on cdc.training.edit (via MENU_PERMISSIONS); the explicit PermissionGuard
// below ensures access never relies solely on the route-guard mapping
// (deep-review R3 #5).
export default function ExamSyllabusTopicsPage() {
  return (
    <PermissionGuard module="cdc.training" action="edit">
    <MasterTablePage
      tableName="cdc_exam_syllabus_topics"
      title="Exam Syllabus Topics"
      description="Government-exam syllabus topics. Mark a topic as 'Shared' when it is common across multiple exams — the cohort-overlap view derives the shared-vs-domain split from these flags (no percentage is hardcoded)."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Exam Syllabus Topics', href: '/cdc/admin/exam-syllabus-topics' },
      ]}
      extraFields={[
        {
          key: 'is_shared',
          label: 'Shared across exams',
          type: 'boolean',
        },
      ]}
      extraListColumns={[
        {
          key: 'is_shared',
          label: 'Scope',
          render: (row) =>
            row.is_shared ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Shared
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Domain-specific
              </span>
            ),
        },
      ]}
    />
    </PermissionGuard>
  );
}
