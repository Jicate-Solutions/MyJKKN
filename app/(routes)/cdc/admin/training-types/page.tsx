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
      ]}
    />
  );
}
