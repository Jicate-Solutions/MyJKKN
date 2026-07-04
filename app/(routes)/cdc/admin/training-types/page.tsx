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
          key: 'exam_family',
          label: 'Government-exam family',
          type: 'text',
          placeholder: 'e.g. tnpsc / rrb / banking / ssc / police (blank if not a govt-exam type)',
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
