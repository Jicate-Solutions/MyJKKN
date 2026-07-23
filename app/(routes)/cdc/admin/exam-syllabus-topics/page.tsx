import { MasterTablePage } from '../_components/master-table-page';
import { CdcHeadGuard } from '../_components/cdc-head-guard';

// CDC govt-job-readiness (PR-4 / Option B): CRUD for the shared-vs-domain
// government-exam syllabus topics. is_shared marks a topic as part of the
// cross-exam common syllabus — it drives the data-driven overlap computed on
// the /cdc/govt-readiness cohort-overlap view. Reuses the generic master UI.
//
// HEAD-ONLY reveal (deep-review R4 #1): writes here flow through the RLS-bound
// generic masters route (createClient) into a table whose write-RLS is
// is_cdc_head_or_super(). Gating the page reveal on the SAME predicate keeps
// app == UI == RLS on ONE head-only boundary, so a cdc_coordinator (who holds
// cdc.training.edit) is not shown an editor whose every write would fail at RLS.
// The /cdc/admin RoutePermissionGuard still applies cdc.training.edit as a coarse
// pre-filter; CdcHeadGuard is the precise boundary. Director may broaden later
// via an explicit RLS change (the guard follows the live predicate automatically).
export default function ExamSyllabusTopicsPage() {
  return (
    <CdcHeadGuard title="Exam Syllabus Topics">
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
    </CdcHeadGuard>
  );
}
