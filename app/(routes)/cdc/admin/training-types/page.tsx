'use client';

// CLIENT COMPONENT ON PURPOSE (2026-09-06). This page passes an
// `extraListColumns[].render` FUNCTION to <MasterTablePage>, which is a client
// component ('use client'). A server component may not hand a function across
// that boundary — Next.js throws at render and the page shows the generic
// "Something went wrong … Server Components render" card, with no clue which
// prop caused it. Measured on production 2026-09-06: this page and
// /cdc/admin/training-types both crashed for a super admin; the siblings that
// pass render functions AND declare 'use client' (recruiters, exam-topic-map)
// render fine. There is no server-only work here — the component is sync and
// the guard below is itself a client component — so the directive is free.
// Do not remove it while an `extraListColumns[].render` prop is passed.
import { MasterTablePage } from '../_components/master-table-page';

export default function TrainingTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_training_types"
      title="Training Types"
      description="Training programme categories (Unnati, MRB, Springboard, etc.) used in the CDC training module."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Training Types', href: '/cdc/admin/training-types' },
      ]}
      extraFields={[
        {
          key: 'default_total_hours',
          label: 'Default total hours',
          type: 'number',
          placeholder: 'e.g. 40',
        },
        {
          // Government-exam family tag (config-key style). Leave blank for
          // ordinary corporate-skill training types. 2026-07-04 govt-job-readiness.
          // nullifyWhenBlank: a blank tag stores NULL (not '') so the type is not
          // treated as a phantom govt-exam by the readiness views (R3 #2).
          key: 'exam_family',
          label: 'Government-exam family',
          type: 'text',
          placeholder: 'e.g. tnpsc / rrb / banking / ssc / police (blank if not a govt-exam type)',
          nullifyWhenBlank: true,
        },
      ]}
      extraListColumns={[
        {
          key: 'default_total_hours',
          label: 'Default hours',
          render: (row) => (
            <span className="text-muted-foreground">
              {row.default_total_hours != null ? `${row.default_total_hours}h` : '—'}
            </span>
          ),
        },
        {
          key: 'exam_family',
          label: 'Exam family',
          render: (row) =>
            row.exam_family ? (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {row.exam_family}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ]}
    />
  );
}
