import { MasterTablePage } from '../_components/master-table-page';

export default function DriveTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_drive_types"
      title="Drive Types"
      description="Placement drive categories available to coordinators when creating a new drive. System types cannot be deactivated."
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'CDC', href: '/admin/cdc' },
        { label: 'Drive Types', href: '/admin/cdc/drive-types' },
      ]}
      extraListColumns={[
        {
          key: 'skip_states',
          label: 'Skipped states',
          render: (row) =>
            row.skip_states?.length ? (
              <span className="text-xs font-mono">{(row.skip_states as string[]).join(', ')}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            ),
        },
      ]}
    />
  );
}
